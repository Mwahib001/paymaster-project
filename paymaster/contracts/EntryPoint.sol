// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// This forces Hardhat to compile the external AA contracts (EntryPoint + accounts) for tests/deployments
import "@account-abstraction/contracts/core/EntryPoint.sol";
import "@account-abstraction/contracts/accounts/SimpleAccount.sol";
import "@account-abstraction/contracts/accounts/SimpleAccountFactory.sol";