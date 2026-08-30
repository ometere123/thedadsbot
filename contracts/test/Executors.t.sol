// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SponsoredMintExecutor} from "../src/SponsoredMintExecutor.sol";
import {DelegatedMintWallet} from "../src/DelegatedMintWallet.sol";

interface Vm {
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function deal(address, uint256) external;
    function prank(address) external;
    function etch(address, bytes calldata) external;
    function expectRevert(bytes4) external;
}

contract MockNFT {
    mapping(address => uint256) public balanceOf;

    function mintTo(address to, uint256 q) external payable {
        balanceOf[to] += q;
    }
}

contract ExecutorsTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 walletKey = 0xA11CE;
    uint256 sponsorKey = 0xB0B;
    address wallet;
    address sponsor;
    MockNFT nft;

    function setUp() public {
        wallet = vm.addr(walletKey);
        sponsor = vm.addr(sponsorKey);
        nft = new MockNFT();
        vm.deal(sponsor, 100 ether);
        vm.deal(wallet, 100 ether);
    }

    function sig(uint256 key, bytes32 d) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, d);
        return abi.encodePacked(r, s, v);
    }

    function testSponsoredBindsIntentAndPostcondition() public {
        SponsoredMintExecutor ex = new SponsoredMintExecutor();
        bytes memory data = abi.encodeCall(MockNFT.mintTo, (wallet, 2));
        SponsoredMintExecutor.MintIntent memory x = SponsoredMintExecutor.MintIntent(
            wallet,
            sponsor,
            address(nft),
            keccak256(data),
            1 ether,
            address(nft),
            wallet,
            1,
            0,
            2,
            block.timestamp + 1 hours,
            bytes32(uint256(1))
        );
        bytes memory signature = sig(walletKey, ex.digest(x));
        vm.prank(sponsor);
        ex.execute{value: 1 ether}(x, data, signature);
        require(nft.balanceOf(wallet) == 2, "mint not proven");
        vm.expectRevert(SponsoredMintExecutor.Replay.selector);
        vm.prank(sponsor);
        ex.execute{value: 1 ether}(x, data, signature);
    }

    function testDelegatedWalletRequiresEOASignature() public {
        DelegatedMintWallet implementation = new DelegatedMintWallet();
        vm.etch(wallet, address(implementation).code);
        DelegatedMintWallet delegated = DelegatedMintWallet(payable(wallet));
        bytes memory data = abi.encodeCall(MockNFT.mintTo, (wallet, 1));
        DelegatedMintWallet.DelegatedMintIntent memory x = DelegatedMintWallet.DelegatedMintIntent(
            wallet,
            sponsor,
            address(nft),
            keccak256(data),
            0,
            0,
            address(nft),
            wallet,
            1,
            0,
            1,
            block.timestamp + 1 hours,
            bytes32(uint256(2))
        );
        bytes memory signature = sig(walletKey, delegated.digest(x));
        vm.prank(sponsor);
        delegated.execute(x, data, signature);
        require(nft.balanceOf(wallet) == 1, "delegated mint failed");
    }
}
