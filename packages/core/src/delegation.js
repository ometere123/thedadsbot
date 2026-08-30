export async function signDelegationAuthorization({privateKey,rpcUrl,implementation,chainId,nonce,executor}){
  const [{createWalletClient,http},{privateKeyToAccount}]=await Promise.all([import('viem'),import('viem/accounts')]);
  const account=privateKeyToAccount(privateKey);const client=createWalletClient({account,transport:http(rpcUrl)});
  return client.signAuthorization({account,contractAddress:implementation,chainId:Number(chainId),...(nonce==null?{}:{nonce:Number(nonce)}),...(executor?{executor}:{})});
}
export function delegationWarning(){return 'EIP-7702 delegation is persistent until revoked. Only delegate to bytecode you have independently verified.';}
