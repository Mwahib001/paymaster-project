// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SimpleAccountFactory} from "@account-abstraction/contracts/accounts/SimpleAccountFactory.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

/// @dev Local wrapper so Hardhat exposes artifact name for tests.
contract RealSimpleAccountFactory is SimpleAccountFactory {
    constructor(IEntryPoint _entryPoint) SimpleAccountFactory(_entryPoint) {}
}