import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

export function Avatar({ name, photoUrl, size = 48 }: { name: string; photoUrl: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]);
  if (!photoUrl || failed) {
    return <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}><Text style={[styles.initial, { fontSize: Math.round(size * 0.42) }]}>{name.charAt(0).toUpperCase()}</Text></View>;
  }
  return <Image source={{ uri: photoUrl }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', backgroundColor: '#E2E5FB', justifyContent: 'center' },
  initial: { color: '#5865D8', fontWeight: '700' },
});
