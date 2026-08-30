import type {
  CreateOrderAction,
  OrderComponents,
  OrderUseCase,
} from "@opensea/seaport-js/lib/types"

/**
 * Run the approval transactions from a seaport-js create-order use case and
 * return the resulting order components, without asking the wallet to sign.
 *
 * `executeAllActions()` also requests an EIP-712 signature. Callers that
 * validate the order onchain have no use for one, since Seaport's `validate()`
 * takes the transaction sender as proof the offerer approved the order.
 * Requesting it anyway costs an extra wallet prompt for a signature that is
 * discarded, and shuts out contract accounts that cannot produce an offchain
 * signature at all.
 *
 * @param useCase The use case returned by `seaport.createOrder`
 * @returns Order components ready for onchain validation
 *
 * @throws Error if the use case has no create-order action.
 */
export const executeApprovalsAndGetOrderComponents = async (
  useCase: OrderUseCase<CreateOrderAction>,
): Promise<OrderComponents> => {
  await useCase.executeApprovals()

  const createAction = useCase.actions.find(action => action.type === "create")
  if (!createAction) {
    throw new Error("Seaport create-order use case has no create action")
  }

  return createAction.orderComponents
}
