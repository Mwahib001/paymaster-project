import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const INITIAL_DEPOSIT = 100000000000000000n; // 0.1 ETH
const HARDHAT_DEFAULT_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

export default buildModule("VerifyingPaymasterModule", (m) => {
  const verifyingSignerAddress = m.getParameter("verifyingSignerAddress", HARDHAT_DEFAULT_ACCOUNT);
  const ownerAddress = m.getParameter("ownerAddress", HARDHAT_DEFAULT_ACCOUNT);

  // Use the wrapper so Hardhat can find the artifact
  const entryPoint = m.contract("RealEntryPoint", []);

  const verifyingPaymaster = m.contract("VerifyingPaymaster", [
    entryPoint,
    verifyingSignerAddress,
    ownerAddress,
  ]);

  m.call(verifyingPaymaster, "depositFunds", [], {
    value: INITIAL_DEPOSIT,
  });

  return { entryPoint, verifyingPaymaster };
});