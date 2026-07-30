import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { GlassFill } from './GlassSurface';
import { Text } from './Text';

const SHEET_OFFSCREEN_Y = 700;

export function GlassModal({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SHEET_OFFSCREEN_Y)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(SHEET_OFFSCREEN_Y);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          mass: 0.9,
          stiffness: 200,
        }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: SHEET_OFFSCREEN_Y, duration: 200, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <BlurView
            intensity={30}
            tint="dark"
            blurMethod="dimezisBlurViewSdk31Plus"
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.glassBackdrop }]} />
        </Pressable>
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          {
            borderTopLeftRadius: tokens.radii['2xl'],
            borderTopRightRadius: tokens.radii['2xl'],
            borderTopWidth: 1,
            borderColor: palette.glassBorder,
            transform: [{ translateY }],
          },
        ]}
      >
        <GlassFill intensity={75} strong />
        {/* Brilho reflexivo na aresta de cima, como o topo curvo de uma placa de vidro */}
        <LinearGradient
          colors={['rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']}
          locations={[0, 1]}
          pointerEvents="none"
          style={styles.topSheen}
        />

        <View style={styles.handle} />

        <ScrollView
          contentContainerStyle={{
            paddingBottom: insets.bottom + tokens.spacing.lg,
            paddingHorizontal: tokens.spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {title && (
            <Text variant="heading" style={{ marginBottom: tokens.spacing.md }}>
              {title}
            </Text>
          )}
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  topSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(120,120,128,0.36)',
    marginTop: 10,
    marginBottom: 6,
  },
});
