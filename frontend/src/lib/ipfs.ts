// IPFS upload using web3.storage
// Requires VITE_WEB3_STORAGE_TOKEN env var

export const WEB3_STORAGE_TOKEN =
  import.meta.env.VITE_WEB3_STORAGE_TOKEN || "";

export interface IpfsUploadResult {
  cid: string; // IPFS CID (e.g. Qm...)
}

export async function uploadToIPFS(content: string): Promise<IpfsUploadResult> {
  if (!WEB3_STORAGE_TOKEN) {
    throw new Error(
      "VITE_WEB3_STORAGE_TOKEN is not set. Add it to your .env file."
    );
  }

  const { Web3Storage } = await import("web3.storage");

  const client = new Web3Storage({ token: WEB3_STORAGE_TOKEN });
  const blob = new Blob([content], { type: "application/json" });
  const files = [new File([blob], "content.json")];

  const cid = await client.put(files);
  return { cid };
}

// Retrieve content from IPFS via public gateway
export async function fetchFromIPFS(cid: string): Promise<string> {
  const url = `https://w3s.link/ipfs/${cid}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch from IPFS: ${response.statusText}`);
  }
  return response.text();
}
