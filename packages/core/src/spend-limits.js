export class SpendViolation extends Error{constructor(message,field='spend'){super(message);this.name='SpendViolation';this.field=field;}}
export function enforceSpendLimits({mintValueWei,gasLimit,maxFeePerGasWei,balanceWei,limits={}}){
  const mint=BigInt(mintValueWei??0),gas=BigInt(gasLimit??0),fee=BigInt(maxFeePerGasWei??0),balance=BigInt(balanceWei??0); if([mint,gas,fee,balance].some(x=>x<0n)) throw new SpendViolation('negative spend input');
  const network=gas*fee,total=mint+network,reserve=BigInt(limits.balanceReserveWei??0);
  if(limits.maxMintValueWei!=null&&mint>BigInt(limits.maxMintValueWei)) throw new SpendViolation('mint value exceeds limit','mint');
  if(limits.maxNetworkFeeWei!=null&&network>BigInt(limits.maxNetworkFeeWei)) throw new SpendViolation('network fee exceeds limit','gas');
  if(limits.maxTotalSpendWei!=null&&total>BigInt(limits.maxTotalSpendWei)) throw new SpendViolation('total spend exceeds limit','total');
  if(balance<total+reserve) throw new SpendViolation('insufficient balance after reserve','balance');
  return {mintValueWei:mint,networkFeeWei:network,totalSpendWei:total,balanceAfterWei:balance-total};
}
