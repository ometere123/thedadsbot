// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Sponsor-funded mint executor. A wallet signs the complete mint intent;
/// a named sponsor pays gas and optionally the mint value. No admin backdoor exists.
contract SponsoredMintExecutor {
    error Expired();
    error Replay();
    error WrongSponsor();
    error WrongFunding();
    error BadSignature();
    error BadTarget();
    error BadRecipient();
    error CalldataMismatch();
    error MintFailed(bytes reason);
    error PostconditionFailed();
    error Reentrancy();

    uint8 internal constant ERC721 = 1;
    uint8 internal constant ERC1155 = 2;
    uint256 internal constant SECP256K1N_HALF = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    bytes32 internal constant TYPEHASH = keccak256(
        "MintIntent(address wallet,address sponsor,address target,bytes32 calldataHash,uint256 value,address nftContract,address recipient,uint8 standard,uint256 tokenId,uint256 minBalanceIncrease,uint256 deadline,bytes32 nonce)"
    );
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant NAME_HASH = keccak256("TheDadBot SponsoredMintExecutor");
    bytes32 internal constant VERSION_HASH = keccak256("1");

    struct MintIntent {
        address wallet;
        address sponsor;
        address target;
        bytes32 calldataHash;
        uint256 value;
        address nftContract;
        address recipient;
        uint8 standard;
        uint256 tokenId;
        uint256 minBalanceIncrease;
        uint256 deadline;
        bytes32 nonce;
    }

    mapping(bytes32 => bool) public used;
    uint256 private locked;
    uint256 private immutable initialChainId;
    bytes32 private immutable initialDomainSeparator;

    constructor() {
        initialChainId = block.chainid;
        initialDomainSeparator = _domain();
    }

    modifier nonReentrant() {
        if (locked != 0) revert Reentrancy();
        locked = 1;
        _;
        locked = 0;
    }

    function domainSeparator() public view returns (bytes32) {
        return block.chainid == initialChainId ? initialDomainSeparator : _domain();
    }

    function digest(MintIntent calldata x) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                TYPEHASH,
                x.wallet,
                x.sponsor,
                x.target,
                x.calldataHash,
                x.value,
                x.nftContract,
                x.recipient,
                x.standard,
                x.tokenId,
                x.minBalanceIncrease,
                x.deadline,
                x.nonce
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function execute(MintIntent calldata x, bytes calldata mintCalldata, bytes calldata signature)
        external
        payable
        nonReentrant
        returns (bytes memory result)
    {
        if (msg.sender != x.sponsor || x.sponsor == address(0)) revert WrongSponsor();
        if (block.timestamp > x.deadline) revert Expired();
        if (
            x.target == address(0) || x.target == address(this) || x.target.code.length == 0
                || x.nftContract.code.length == 0
        ) revert BadTarget();
        if (x.recipient == address(0)) revert BadRecipient();
        if (msg.value != x.value) revert WrongFunding();
        if (keccak256(mintCalldata) != x.calldataHash) revert CalldataMismatch();
        bytes32 d = digest(x);
        if (used[d]) revert Replay();
        if (_recover(d, signature) != x.wallet) revert BadSignature();
        uint256 beforeBalance = _balance(x.nftContract, x.recipient, x.standard, x.tokenId);
        used[d] = true;
        (bool ok, bytes memory out) = x.target.call{value: x.value}(mintCalldata);
        if (!ok) revert MintFailed(out);
        uint256 afterBalance = _balance(x.nftContract, x.recipient, x.standard, x.tokenId);
        if (afterBalance < beforeBalance + x.minBalanceIncrease) revert PostconditionFailed();
        return out;
    }

    function _domain() private view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function _balance(address nft, address owner, uint8 standard, uint256 tokenId)
        private
        view
        returns (uint256 value)
    {
        bytes memory payload;
        if (standard == ERC721) payload = abi.encodeWithSelector(bytes4(0x70a08231), owner);
        else if (standard == ERC1155) payload = abi.encodeWithSelector(bytes4(0x00fdd58e), owner, tokenId);
        else revert PostconditionFailed();
        (bool ok, bytes memory out) = nft.staticcall(payload);
        if (!ok || out.length < 32) revert PostconditionFailed();
        value = abi.decode(out, (uint256));
    }

    function _recover(bytes32 d, bytes calldata sig) private pure returns (address signer) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (uint256(s) > SECP256K1N_HALF || (v != 27 && v != 28)) revert BadSignature();
        signer = ecrecover(d, v, r, s);
        if (signer == address(0)) revert BadSignature();
    }
}
