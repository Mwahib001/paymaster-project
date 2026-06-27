// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";

/// @dev Local wrapper so Hardhat exposes "RealEntryPoint" artifact for deployment in tests.
contract RealEntryPoint is EntryPoint {}