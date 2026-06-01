import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
  StatusBar,
  FlatList,
  type ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface Props {
  visible: boolean;
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

/**
 * Lightbox plein écran premium (Airbnb / Booking / Instagram style).
 *
 * Fonctionnalités :
 *   • Swipe horizontal entre les photos (FlatList pagingEnabled)
 *   • Pinch-to-zoom (1× ↔ 3×)
 *   • Double-tap pour zoom rapide (1× ↔ 2.5×)
 *   • Pan quand zoomé
 *   • Compteur "3 / 15" en haut
 *   • Fermeture par bouton ✕ ou tap zone neutre
 *
 * On désactive le swipe horizontal natif quand l'utilisateur est en zoom
 * pour éviter les conflits de geste.
 */
export function Lightbox({ visible, images, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const listRef = useRef<FlatList<string>>(null);

  // Re-sync l'index quand le user ouvre le lightbox sur une photo donnée.
  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
      // Petit délai pour laisser le FlatList monter avant scrollToIndex
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      });
    }
  }, [visible, initialIndex]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems[0]?.index != null) {
        setIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar hidden={visible} />
      <GestureHandlerRootView style={s.root}>
        {/* Top bar : counter + close */}
        <View style={s.topBar} pointerEvents="box-none">
          <View style={s.counterPill}>
            <Text style={s.counterText}>{index + 1} / {images.length}</Text>
          </View>
          <Pressable
            hitSlop={12}
            onPress={onClose}
            style={s.closeBtn}
            accessibilityLabel="Fermer"
          >
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(uri, i) => uri + i}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          // Désactive le swipe natif quand on est zoomé sur l'image courante,
          // sinon le pan de zoom déclenche un changement de slide.
          scrollEnabled={!isZoomed}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
          renderItem={({ item, index: i }) => (
            <ZoomableImage uri={item} isActive={i === index} onZoomChange={setIsZoomed} />
          )}
        />
      </GestureHandlerRootView>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// Image zoomable individuelle (pinch + double-tap + pan)
// ----------------------------------------------------------------------------
const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const MIN_SCALE = 1;
const MAX_SCALE = 3;
const DOUBLE_TAP_SCALE = 2.5;

function ZoomableImage({
  uri,
  isActive,
  onZoomChange,
}: {
  uri: string;
  isActive: boolean;
  onZoomChange: (z: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTX = useSharedValue(0);
  const savedTY = useSharedValue(0);

  // Reset à 1× quand on quitte l'image (changement de slide).
  useEffect(() => {
    if (!isActive) {
      scale.value = withTiming(1, { duration: 200 });
      translateX.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(0, { duration: 200 });
      savedScale.value = 1;
      savedTX.value = 0;
      savedTY.value = 0;
    }
  }, [isActive, scale, translateX, translateY, savedScale, savedTX, savedTY]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      const zoomed = scale.value > 1.05;
      onZoomChange(zoomed);
      if (!zoomed) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTX.value = 0;
        savedTY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onUpdate((e) => {
      // Pan utile seulement quand zoomé.
      if (scale.value <= 1.05) return;
      translateX.value = savedTX.value + e.translationX;
      translateY.value = savedTY.value + e.translationY;
    })
    .onEnd(() => {
      savedTX.value = translateX.value;
      savedTY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(220)
    .onEnd(() => {
      const zoomed = scale.value > 1.05;
      if (zoomed) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTX.value = 0;
        savedTY.value = 0;
        onZoomChange(false);
      } else {
        scale.value = withSpring(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
        onZoomChange(true);
      }
    });

  // Pan ne fonctionne qu'avec scale > 1 ; pinch peut s'activer à tout moment.
  // Les 3 gestes sont composés en `Simultaneous` pour qu'ils puissent
  // s'activer en parallèle sans se bloquer.
  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={s.slide}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[s.imageWrap, animatedStyle]}>
          <Image source={{ uri }} style={s.image} resizeMode="contain" />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 10,
    paddingTop: 48, // safe-area approximée
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counterPill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  counterText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slide: {
    width: SCREEN_W,
    height: SCREEN_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  image: { width: '100%', height: '100%' },
});
