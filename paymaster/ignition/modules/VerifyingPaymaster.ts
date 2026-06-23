import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const CANONICAL_ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const INITIAL_DEPOSIT = 100000000000000000n;

export default buildModule("VerifyingPaymasterModule", (m) => {
  const entryPointAddress = m.getParameter("entryPointAddress", CANONICAL_ENTRY_POINT);
  const verifyingSignerAddress = m.getParameter("verifyingSignerAddress");
  const ownerAddress = m.getParameter("ownerAddress");

  const verifyingPaymaster = m.contract("VerifyingPaymaster", [
    entryPointAddress,
    verifyingSignerAddress,
    ownerAddress,
  ]);

  m.call(verifyingPaymaster, "depositFunds", [], {
    value: INITIAL_DEPOSIT,
  });

  return { verifyingPaymaster };
});
