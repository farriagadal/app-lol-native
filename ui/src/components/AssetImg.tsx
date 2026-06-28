/**
 * <img> resiliente para assets de LoL. Si la imagen falla:
 *  1) si es un asset local (descarga parcial), reintenta una vez contra su CDN
 *     de origen (vía resolver.cdnFallback);
 *  2) si aun así falla, se oculta para no dejar el icono roto.
 * Sustituye el `imgErr` inline y el wireAssetFallback global del app.js antiguo.
 */
import { useCallback, type ImgHTMLAttributes, type SyntheticEvent } from 'react';
import { useAssets } from '../assets/AssetsContext';

export function AssetImg(props: ImgHTMLAttributes<HTMLImageElement>) {
  const assets = useAssets();
  const onError = useCallback(
    (e: SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      if (!img.dataset.cdnTried) {
        let cdn: string | null = null;
        try {
          cdn = assets.cdnFallback(new URL(img.src).pathname);
        } catch {
          /* src vacío */
        }
        if (cdn) {
          img.dataset.cdnTried = '1';
          img.src = cdn;
          return;
        }
      }
      img.style.visibility = 'hidden';
    },
    [assets],
  );
  // alt por defecto vacío: son iconos decorativos con title informativo.
  return <img alt="" {...props} onError={onError} />;
}
