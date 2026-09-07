import NetInfo from "@react-native-community/netinfo";

export type ConnectivityListener = (online: boolean) => void;

let lastOnline = true;

export function isOnlineNow(): boolean {
  return lastOnline;
}

/**
 * Suscribe al estado de red. Emite el valor inicial + cambios.
 * `online` = connected && (isInternetReachable !== false).
 */
export function subscribeConnectivity(
  onChange: ConnectivityListener
): () => void {
  const apply = (online: boolean): void => {
    if (online === lastOnline) return;
    lastOnline = online;
    onChange(online);
  };

  const unsub = NetInfo.addEventListener((state) => {
    const online =
      !!state.isConnected && state.isInternetReachable !== false;
    apply(online);
  });

  void NetInfo.fetch().then((state) => {
    const online =
      !!state.isConnected && state.isInternetReachable !== false;
    lastOnline = online;
    onChange(online);
  });

  return unsub;
}
