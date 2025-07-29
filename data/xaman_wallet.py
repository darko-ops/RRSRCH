from xrpl.clients import JsonRpcClient
from xrpl.models.requests import AccountInfo
from xrpl.utils import drops_to_xrp

JSON_RPC_URL = "https://s1.ripple.com:51234"

def get_xaman_wallet_balance(address: str):
    client = JsonRpcClient(JSON_RPC_URL)

    try:
        acct_request = AccountInfo(
            account=address,
            ledger_index="validated",
            strict=True
        )
        response = client.request(acct_request)
        balance_drops = response.result["account_data"]["Balance"]
        balance_xrp = drops_to_xrp(balance_drops)
        return float(balance_xrp)
    except Exception as e:
        print("❌ Error fetching Xaman wallet balance:", e)
        return None
