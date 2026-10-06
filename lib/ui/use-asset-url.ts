"use client";

import { useEffect, useState } from "react";
import { getRepositories } from "@/lib/repositories";

export type AssetState = { status: "loading" | "missing"; url: null } | { status: "ready"; url: string };

const LOADING: AssetState = { status: "loading", url: null };
const MISSING: AssetState = { status: "missing", url: null };

/**
 * Object URL for a locally stored asset; revoked automatically. Reports
 * "missing" when the image isn't stored (e.g. restored from a backup made
 * without screenshots).
 */
export function useAsset(assetId: string | null): AssetState {
  const [loaded, setLoaded] = useState<{ assetId: string; state: AssetState } | null>(null);

  useEffect(() => {
    if (!assetId) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    getRepositories()
      .assets.get(assetId)
      .then((asset) => {
        if (cancelled) return;
        if (!asset) {
          setLoaded({ assetId, state: MISSING });
          return;
        }
        objectUrl = URL.createObjectURL(asset.blob);
        setLoaded({ assetId, state: { status: "ready", url: objectUrl } });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ assetId, state: MISSING });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);

  if (!assetId) return MISSING;
  return loaded?.assetId === assetId ? loaded.state : LOADING;
}

/** Just the URL: `null` while loading or when the asset is missing. */
export function useAssetUrl(assetId: string | null): string | null {
  return useAsset(assetId).url;
}
