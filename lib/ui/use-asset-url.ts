"use client";

import { useEffect, useState } from "react";
import { getRepositories } from "@/lib/repositories";

/** Object URL for a locally stored asset; revoked automatically. `null` until loaded. */
export function useAssetUrl(assetId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    getRepositories()
      .assets.get(assetId)
      .then((asset) => {
        if (cancelled || !asset) return;
        objectUrl = URL.createObjectURL(asset.blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        /* Missing asset: leave the placeholder showing. */
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [assetId]);

  return url;
}
