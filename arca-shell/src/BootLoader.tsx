import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { SHELL_CONFIG } from "./config";
import { SHELL_COPY, st } from "./shellLocale";

const LOGO = require("../assets/splash.png");
const LOGO_SIZE = 220;

type Props = {
  /** 1 = visible, 0 = oculto (fade out controlado por App). */
  opacity: Animated.Value;
};

/**
 * Continuación del splash nativo: logo con pulse zoom + texto localizado.
 */
export function BootLoader({ opacity }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.08,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(scale, {
          toValue: 0.94,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [scale]);

  return (
    <Animated.View style={[styles.root, { opacity }]} pointerEvents="none">
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image source={LOGO} style={styles.logo} />
      </Animated.View>
      <Text style={styles.label}>{st(SHELL_COPY.loading)}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SHELL_CONFIG.backgroundColor,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    resizeMode: "contain"
  },
  label: {
    marginTop: 28,
    color: "#c8d6e5",
    fontSize: 16,
    letterSpacing: 0.6
  }
});
