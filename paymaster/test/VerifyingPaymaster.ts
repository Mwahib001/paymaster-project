import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import {
  concatHex,
  encodeAbiParameters,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { buildUserOp, type PackedUserOperation } from "./helpers/userOpBuilder.js";

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
    userOpHash: Hex,
    paymasterAddress: Address,
    validUntil: bigint,
    validAfter: bigint,
    signer = verifyingAccount,
  ) {
    const chainId = await publicClient.getChainId();
    const signedHash = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "address" },
          { type: "uint48" },
          { type: "uint48" },
          { type: "uint256" },
        ],
        [userOpHash, paymasterAddress, validUntil, validAfter, BigInt(chainId)],
      ),
    );

    return signer.signMessage({ message: { raw: signedHash } });
  }

  function packPaymasterAndData(paymasterAddress: Address, validUntil: bigint, validAfter: bigint, signature: Hex) {
    return concatHex([
      paymasterAddress,
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
    const userOpHash = buildHash(nonce);
    const signature = await signAuthorization(userOpHash, paymasterAddress, validUntil, validAfter, signer);
    const paymasterAndData = packPaymasterAndData(paymasterAddress, validUntil, validAfter, signature);
    const userOp = buildUserOp(sender.account.address, nonce, "0x", { paymasterAndData });

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
});
