import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, Image, StyleSheet, View } from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';

const BG = '#0a1228';

interface Props {
  onFinish: () => void;
}

const AnimatedSvg = Animated.createAnimatedComponent(Svg);
const AnimatedView = Animated.createAnimatedComponent(View);

/**
 * One-shot launch animation:
 *   1. The static Nuffie scene fades up.
 *   2. A footy ball arcs from the top-left, rotating, through the middle goalposts.
 *   3. A celebration burst (white flash + sparkles) pops the moment the ball clears.
 *   4. The whole thing fades out and calls onFinish.
 */
export function AnimatedSplash({ onFinish }: Props) {
  const sceneFade = useRef(new Animated.Value(0)).current;
  const ballX = useRef(new Animated.Value(0)).current;
  const ballRotate = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const overallFade = useRef(new Animated.Value(1)).current;

  const { width, height } = Dimensions.get('window');

  useEffect(() => {
    Animated.sequence([
      // 1. Scene fades in
      Animated.timing(sceneFade, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // 2. Ball flies through (parallel rotation)
      Animated.parallel([
        Animated.timing(ballX, {
          toValue: 1,
          duration: 1100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ballRotate, {
          toValue: 1,
          duration: 1100,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
      // 3. Celebration burst
      Animated.timing(burst, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // 4. Hold celebration
      Animated.delay(550),
      // 5. Fade everything out
      Animated.timing(overallFade, {
        toValue: 0,
        duration: 350,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => onFinish());
  }, []);

  // The Nuffie scene image is contain-fit, so its on-screen extent is width × width
  // (square). All ball translations are anchored to that — using `width` for both axes
  // keeps the trajectory inside the image regardless of phone aspect ratio.
  // Path: kicked from off-screen lower-left, arcs up through the gap between the two
  // middle goalposts, settling roughly where the original static ball used to sit.
  const ballTranslateX = ballX.interpolate({
    inputRange: [0, 1],
    outputRange: [-width * 0.55, width * 0.0],
  });
  const ballTranslateY = ballX.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [width * 0.25, -width * 0.05, -width * 0.20],
  });
  const ballSpin = ballRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-180deg', '360deg'],
  });

  const burstScale = burst.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1.6],
  });
  const burstOpacity = burst.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0.9, 0],
  });

  return (
    <AnimatedView
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: BG, opacity: overallFade }]}
    >
      <Animated.Image
        source={require('../../assets/splash-scene.png')}
        style={[styles.scene, { opacity: sceneFade }]}
        resizeMode="contain"
      />

      {/* Ball — overlaid on scene, animated by translate + rotate */}
      <Animated.View
        style={[
          styles.ballWrap,
          {
            transform: [
              { translateX: ballTranslateX },
              { translateY: ballTranslateY },
              { rotate: ballSpin },
            ],
            opacity: ballX.interpolate({
              inputRange: [0, 0.05, 0.85, 1],
              outputRange: [0, 1, 1, 0],
            }),
          },
        ]}
      >
        <Svg width={72} height={48} viewBox="-40 -28 80 56">
          <Ellipse cx={0} cy={0} rx={36} ry={22} fill="#d8362a" />
          <Ellipse cx={-8} cy={-7} rx={20} ry={8} fill="#f26b59" opacity={0.7} />
          <Path d="M -28 4 Q 0 22 28 4 Q 0 14 -28 4 Z" fill="#9a1f15" opacity={0.55} />
          <Path d="M -24 0 L 24 0" stroke="#ffd84d" strokeWidth={3} strokeLinecap="round" />
          <Path
            d="M -16 0 L -16 -6 M -8 0 L -8 -7 M 0 0 L 0 -7 M 8 0 L 8 -7 M 16 0 L 16 -6"
            stroke="#fff"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

      {/* Celebration burst — radial white flash */}
      <Animated.View
        style={[
          styles.burst,
          {
            opacity: burstOpacity,
            transform: [{ scale: burstScale }],
          },
        ]}
      >
        <Svg width={300} height={300} viewBox="-150 -150 300 300">
          <Ellipse cx={0} cy={0} rx={80} ry={80} fill="#fff8d8" opacity={0.55} />
          <Ellipse cx={0} cy={0} rx={50} ry={50} fill="#ffffff" opacity={0.8} />
        </Svg>
      </Animated.View>

      {/* Sparkles — pop in with the burst */}
      <Animated.View style={[styles.sparkles, { opacity: burst }]}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {sparklePositions(width, height).map((p, i) => (
            <Path key={i} d={diamond(p.x, p.y, p.s)} fill="#ffd84d" opacity={0.9} />
          ))}
        </Svg>
      </Animated.View>
    </AnimatedView>
  );
}

function diamond(cx: number, cy: number, s: number) {
  return `M ${cx} ${cy - s} L ${cx + s * 0.4} ${cy} L ${cx} ${cy + s} L ${cx - s * 0.4} ${cy} Z`;
}

function sparklePositions(width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  return [
    { x: cx - 90, y: cy - 60, s: 8 },
    { x: cx + 110, y: cy - 90, s: 10 },
    { x: cx - 130, y: cy + 30, s: 7 },
    { x: cx + 80, y: cy + 70, s: 9 },
    { x: cx + 150, y: cy + 10, s: 6 },
    { x: cx - 60, y: cy - 110, s: 6 },
  ];
}

const styles = StyleSheet.create({
  scene: { position: 'absolute', width: '100%', height: '100%' },
  ballWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 72,
    height: 48,
    marginTop: -24,
    marginLeft: -36,
  },
  burst: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 300,
    height: 300,
    marginTop: -150,
    marginLeft: -150,
  },
  sparkles: { ...StyleSheet.absoluteFillObject },
});
