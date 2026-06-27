import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import {
  concatHex,
  encodeAbiParameters,
  keccak256,
  pad,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { buildUserOp, DUMMY_PAYMASTER_SIGNATURE, packUint128Pair, type PackedUserOperation } from "./helpers/userOpBuilder.js";
import { encodeFunctionData, recoverAddress } from "viem";

const SIGNER_PRIVATE_KEY = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WRONG_SIGNER_PRIVATE_KEY = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SIG_VALIDATION_FAILED = 1n;
const VALIDATION_RESULT_MASK = (1n << 160n) - 1n;

describe("VerifyingPaymaster", async function () {
  const { viem, networkHelpers } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [owner, sender, other] = await viem.getWalletClients();
  const verifyingAccount = privateKeyToAccount(SIGNER_PRIVATE_KEY);
  const wrongAccount = privateKeyToAccount(WRONG_SIGNER_PRIVATE_KEY);

  async function deployVerifyingPaymaster() {
    const entryPoint = await viem.deployContract("EntryPointMock");
    const paymaster = await viem.deployContract("VerifyingPaymaster", [
      entryPoint.address,
      verifyingAccount.address,
      owner.account.address,
    ]);

    return { entryPoint, paymaster };
  }

  async function latestValidityWindow() {
    const latest = BigInt(await networkHelpers.time.latest());

    return {
      validUntil: latest + 3600n,
      validAfter: latest - 1n,
    };
  }

  function buildHash(nonce: bigint) {
    return keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [sender.account.address, nonce],
      ),
    );
  }

  async function signAuthorization(
    userOp: PackedUserOperation,
    paymasterAddress: Address,
    validUntil: bigint,
    validAfter: bigint,
    signer = verifyingAccount,
  ) {
    const chainId = await publicClient.getChainId();

    // Must match the new contract logic in VerifyingPaymaster:
    // intentHash = keccak( encode(sender, nonce, keccak(callData), accountGasLimits, preVerificationGas, gasFees, vu, va, chain) )
    // then signedHash = keccak( encode(intentHash, paymaster) )
    const intentHash = keccak256(
      encodeAbiParameters(
        [
          { type: "address" },
          { type: "uint256" },
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "uint256" },
          { type: "bytes32" },
          { type: "uint48" },
          { type: "uint48" },
          { type: "uint256" },
        ],
        [
          userOp.sender,
          userOp.nonce,
          keccak256(userOp.callData),
          userOp.accountGasLimits,
          userOp.preVerificationGas,
          userOp.gasFees,
          validUntil,
          validAfter,
          BigInt(chainId),
        ],
      ),
    );

    const signedHash = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }],
        [intentHash, paymasterAddress],
      ),
    );

    return signer.signMessage({ message: { raw: signedHash } });
  }

  function packPaymasterAndData(paymasterAddress: Address, validUntil: bigint, validAfter: bigint, signature: Hex) {
    // Standard layout: pm + pmVerifGas(16) + pmPostOpGas(16) + times(6+6) + sig
    // Use positive gas so EP prepayment accepts the paymaster op
    const pmGasLimits = concatHex([
      pad(toHex(200000n), { size: 16 }),
      pad(toHex(100000n), { size: 16 }),
    ]);
    return concatHex([
      paymasterAddress,
      pmGasLimits,
      toHex(validUntil, { size: 6 }),
      toHex(validAfter, { size: 6 }),
      signature,
    ]);
  }

  async function buildSignedUserOp(
    paymasterAddress: Address,
    nonce: bigint,
    validUntil: bigint,
    validAfter: bigint,
    signer = verifyingAccount,
  ) {
    // Realistic client flow: build op (pmAndData can be empty or contain dummy for hash calc).
    // Sponsorship sig no longer depends on pmAndData or full userOpHash.
    const baseUserOp = buildUserOp(sender.account.address, nonce, "0x", { paymasterAndData: "0x" });

    const signature = await signAuthorization(baseUserOp, paymasterAddress, validUntil, validAfter, signer);
    const paymasterAndData = packPaymasterAndData(paymasterAddress, validUntil, validAfter, signature);

    const userOp = buildUserOp(sender.account.address, nonce, "0x", { paymasterAndData });

    // For the mock EP we still use an independent "userOpHash" value (the test never relied on it
    // matching a hash of the userOp). In real life this would be EP.getUserOpHash(finalUserOp).
    const userOpHash = buildHash(nonce);
    return { userOp, userOpHash };
  }

  function validationResult(validationData: bigint) {
    return validationData & VALIDATION_RESULT_MASK;
  }

  it("should accept a valid signed UserOperation", async function () {
    const { entryPoint, paymaster } = await networkHelpers.loadFixture(deployVerifyingPaymaster);
    const { validUntil, validAfter } = await latestValidityWindow();
    const { userOp, userOpHash } = await buildSignedUserOp(paymaster.address, 1n, validUntil, validAfter);

    const { result } = await entryPoint.simulate.callValidate([paymaster.address, userOp, userOpHash, 0n]);

    assert.equal(validationResult(result[1]), 0n);
  });

  it("should reject a UserOperation signed by wrong signer", async function () {
    const { entryPoint, paymaster } = await networkHelpers.loadFixture(deployVerifyingPaymaster);
    const { validUntil, validAfter } = await latestValidityWindow();
    const { userOp, userOpHash } = await buildSignedUserOp(
      paymaster.address,
      2n,
      validUntil,
      validAfter,
      wrongAccount,
    );

    const { result } = await entryPoint.simulate.callValidate([paymaster.address, userOp, userOpHash, 0n]);

    assert.equal(validationResult(result[1]), SIG_VALIDATION_FAILED);
  });

  it("should reject an expired UserOperation", async function () {
    const { entryPoint, paymaster } = await networkHelpers.loadFixture(deployVerifyingPaymaster);
    const latest = BigInt(await networkHelpers.time.latest());
    const validUntil = latest - 1n;
    const validAfter = latest - 3600n;
    const { userOp, userOpHash } = await buildSignedUserOp(paymaster.address, 3n, validUntil, validAfter);

    await viem.assertions.revertWithCustomError(
      entryPoint.write.callValidate([paymaster.address, userOp, userOpHash, 0n]),
      paymaster,
      "SignatureExpired",
    );
  });

  it("should reject malformed paymasterAndData", async function () {
    const { entryPoint, paymaster } = await networkHelpers.loadFixture(deployVerifyingPaymaster);
    const userOpHash = buildHash(4n);
    const userOp = buildUserOp(sender.account.address, 4n, "0x", {
      paymasterAndData: concatHex([paymaster.address, "0x1234"]),
    });

    await viem.assertions.revertWithCustomError(
      entryPoint.write.callValidate([paymaster.address, userOp, userOpHash, 0n]),
      paymaster,
      "InvalidSignature",
    );
  });

  it("should prevent replay of same UserOperation hash", async function () {
    const { entryPoint, paymaster } = await networkHelpers.loadFixture(deployVerifyingPaymaster);
    const { validUntil, validAfter } = await latestValidityWindow();
    const { userOp, userOpHash } = await buildSignedUserOp(paymaster.address, 5n, validUntil, validAfter);

    await entryPoint.write.callValidate([paymaster.address, userOp, userOpHash, 0n]);
    const { result } = await entryPoint.simulate.callValidate([paymaster.address, userOp, userOpHash, 0n]);

    assert.equal(validationResult(result[1]), SIG_VALIDATION_FAILED);
  });

  it("should allow owner to deposit and withdraw funds", async function () {
    const { paymaster } = await networkHelpers.loadFixture(deployVerifyingPaymaster);
    const depositAmount = 100000000000000000n;
    const withdrawAmount = 40000000000000000n;

    await paymaster.write.depositFunds({ value: depositAmount });
    assert.equal(await paymaster.read.getDeposit(), depositAmount);

    await paymaster.write.withdrawFunds([owner.account.address, withdrawAmount]);
    assert.equal(await paymaster.read.getDeposit(), depositAmount - withdrawAmount);
  });

  it("should prevent non-owner from calling updateSigner", async function () {
    const { paymaster } = await networkHelpers.loadFixture(deployVerifyingPaymaster);

    await viem.assertions.revertWithCustomErrorWithArgs(
      paymaster.write.updateSigner([wrongAccount.address], { account: other.account }),
      paymaster,
      "OwnableUnauthorizedAccount",
      [other.account.address],
    );
  });

  it("should emit UserOperationSponsored on postOp", async function () {
    const { entryPoint, paymaster } = await networkHelpers.loadFixture(deployVerifyingPaymaster);
    const userOpHash = buildHash(6n);
    const actualGasCost = 12345n;
    const context = encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      [userOpHash, sender.account.address, 0n],
    );

    await viem.assertions.emitWithArgs(
      entryPoint.write.callPostOp([paymaster.address, 0, context, actualGasCost, 1n]),
      paymaster,
      "UserOperationSponsored",
      [userOpHash, sender.account.address, actualGasCost],
    );
  });

  // =====================================================
  // Stronger integration test (task 1)
  // - dummy pmAndData -> sponsorship via TS logic -> replace -> validatePaymasterUserOp (via mock) + postOp sim
  // =====================================================
  it("should sponsor via TS logic (dummy pmAndData, replace) + real account sig + handleOps on real EP (counterfactual initCode)", async function () {
    const entryPoint = await viem.deployContract("RealEntryPoint");
    const factory = await viem.deployContract("RealSimpleAccountFactory", [entryPoint.address]);
    const paymaster = await viem.deployContract("VerifyingPaymaster", [
      entryPoint.address,
      verifyingAccount.address,
      owner.account.address,
    ]);

    await paymaster.write.depositFunds({ value: 10n ** 18n });

    const saOwner = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const salt = 777n;
    const accountAddress = await factory.read.getAddress([saOwner.address, salt]);

    const createCalldata = encodeFunctionData({
      abi: factory.abi,
      functionName: "createAccount",
      args: [saOwner.address, salt],
    });
    const initCode = concatHex([factory.address, createCalldata]);

    const counter = await viem.deployContract("Counter");
    const innerCall = encodeFunctionData({ abi: counter.abi, functionName: "inc" });

    const executeAbi = [{
      name: "execute",
      type: "function",
      inputs: [
        { name: "target", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
      ],
      outputs: [],
      stateMutability: "nonpayable",
    }] as const;

    const accountCallData = encodeFunctionData({
      abi: executeAbi,
      functionName: "execute",
      args: [counter.address, 0n, innerCall],
    });

    const latest = BigInt(await networkHelpers.time.latest());
    const validUntil = latest + 3600n;
    const validAfter = latest;
    const nonce = 0n;

    const dummyPmAndData = concatHex([
      paymaster.address,
      concatHex([
        pad(toHex(200000n), { size: 16 }),
        pad(toHex(100000n), { size: 16 }),
      ]),
      toHex(validUntil, { size: 6 }),
      toHex(validAfter, { size: 6 }),
      DUMMY_PAYMASTER_SIGNATURE,
    ]);

    let userOp = buildUserOp(accountAddress, nonce, accountCallData, {
      initCode,
      accountGasLimits: packUint128Pair(300000n, 200000n),
      preVerificationGas: 100000n,
      gasFees: packUint128Pair(1000000000n, 1000000000n),
      paymasterAndData: dummyPmAndData,
    });

    const pmSig = await signAuthorization(userOp, paymaster.address, validUntil, validAfter);
    const finalPmAndData = packPaymasterAndData(paymaster.address, validUntil, validAfter, pmSig);
    userOp = { ...userOp, paymasterAndData: finalPmAndData };

    const userOpHash = await entryPoint.read.getUserOpHash([userOp]);
    const accountSig = await saOwner.sign({ hash: userOpHash });
    userOp = { ...userOp, signature: accountSig };

    const recovered = await recoverAddress({ hash: userOpHash, signature: accountSig });
    assert.equal(recovered, saOwner.address);

    // Direct check that the pm accepts (with real EP as msg.sender)
    const maxCost = 1n * 10n**18n;
    const { result: pmResult } = await publicClient.simulateContract({
      account: entryPoint.address,
      address: paymaster.address,
      abi: paymaster.abi,
      functionName: "validatePaymasterUserOp",
      args: [userOp, userOpHash, maxCost],
    });
    const [, pmValidationData] = pmResult;
    assert.equal(pmValidationData & 1n, 0n, "pm should validate successfully");

    const beneficiary = owner.account.address;
    const txHash = await entryPoint.write.handleOps(
      [[userOp], beneficiary],
      { account: owner.account, gas: 10_000_000n }
    );
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    assert.equal(await counter.read.x(), 1n);
  });
});
