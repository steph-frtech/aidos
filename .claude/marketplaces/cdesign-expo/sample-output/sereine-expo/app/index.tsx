import { LinearGradient } from "expo-linear-gradient";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BreathingCircle } from "../components/breathing-circle";
import { SereineWordmark } from "../components/sereine-wordmark";
import { sereinePalette } from "../constants/sereine-palette";
import { useRotatingIndex } from "../hooks/use-rotating-index";

type Slide = {
  kicker: string;
  title: string;
  body: string;
};

const ROTATING_WORDS: readonly string[] = ["Apprenez", "Pensez", "Agissez", "Devenez"];

const SLIDES: readonly Slide[] = [
  {
    kicker: "Respiration",
    title: "Trois respirations\npour ralentir",
    body: "Une cohérence cardiaque guidée, audio et visuelle, pour retrouver le calme en 90 secondes.",
  },
  {
    kicker: "Check-in",
    title: "Comment allez-vous,\nvraiment ?",
    body: "Posez un mot sur votre humeur chaque jour. Suivez les nuances qui se dessinent.",
  },
  {
    kicker: "TCC",
    title: "Des outils cliniques,\nrendus simples",
    body: "Thérapies cognitives et comportementales, conçues avec des psychologues diplômés.",
  },
  {
    kicker: "Séances",
    title: "Un psychologue,\nquand vous voulez",
    body: "Visios confidentielles avec un clinicien partenaire, remboursables selon votre mutuelle.",
  },
];

export default function HomeScreen() {
  const palette = sereinePalette;
  const wordIndex = useRotatingIndex(ROTATING_WORDS.length, 3500);
  const slideIndex = useRotatingIndex(SLIDES.length, 4200);
  const currentSlide = SLIDES[slideIndex] ?? SLIDES[0];
  const currentWord = ROTATING_WORDS[wordIndex] ?? ROTATING_WORDS[0];

  const gradientColors = useMemo<[string, string, string]>(
    () => [palette.cream, palette.mist, palette.paper],
    [palette],
  );

  const handleStart = () => {
    // TODO: wire to onboarding flow
  };

  const handleSignIn = () => {
    // TODO: navigate to sign-in screen
  };

  return (
    <View className="flex-1" style={{ backgroundColor: palette.cream }}>
      <LinearGradient
        colors={gradientColors}
        locations={[0, 0.55, 1]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Decorative blob layer — static placeholder. */}
      {/* TODO: animate via Reanimated 3 to match blob-morph keyframes. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: "absolute",
          top: -60,
          right: -90,
          width: 360,
          height: 360,
          borderRadius: 180,
          backgroundColor: palette.sageDeep,
          opacity: 0.92,
        }}
      />
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: "absolute",
          top: 140,
          left: -120,
          width: 280,
          height: 280,
          borderRadius: 140,
          backgroundColor: palette.mist,
          opacity: 0.85,
        }}
      />

      <SafeAreaView className="flex-1">
        <View className="flex-row items-center justify-between px-7 pt-2">
          <SereineWordmark palette={palette} testID="home-wordmark" />
          <Pressable
            onPress={() => {
              // TODO: toggle locale
            }}
            accessibilityRole="button"
            accessibilityLabel="Changer la langue"
            accessibilityHint="Bascule entre français et anglais"
            testID="home-lang-toggle"
            hitSlop={8}
          >
            <Text
              className="text-[11px] uppercase tracking-[0.08em]"
              style={{ color: palette.inkSoft, opacity: 0.7 }}
            >
              FR · EN
            </Text>
          </Pressable>
        </View>

        <View className="absolute right-12 top-28">
          <BreathingCircle palette={palette} size={96} ringDelayMs={1200} />
          <View
            pointerEvents="none"
            style={{ position: "absolute", inset: 0 }}
            className="items-center justify-center"
          >
            <Text
              key={currentWord}
              accessibilityLiveRegion="polite"
              style={{ color: palette.cream, opacity: 0.95 }}
              className="font-serif italic text-[15px] tracking-[0.3px]"
            >
              {currentWord}
            </Text>
          </View>
        </View>

        <View className="flex-1 justify-end px-7 pb-44">
          <View style={{ width: 56, height: 56, marginBottom: 22 }}>
            <BreathingCircle palette={palette} size={20} ringDelayMs={1400} />
          </View>

          <View className="mb-5 flex-row items-center gap-2">
            <View style={{ width: 18, height: 1, backgroundColor: palette.sageDeep }} />
            <Text
              className="text-[11px] font-medium uppercase tracking-[0.18em]"
              style={{ color: palette.sageDeep }}
            >
              Soin psychologique au quotidien
            </Text>
          </View>

          <Text
            accessibilityRole="header"
            style={{ color: palette.ink }}
            className="font-serif text-[52px] font-light leading-[1.02] tracking-tight"
          >
            Revenir{" "}
            <Text style={{ color: palette.sageDeep, fontStyle: "italic" }}>à&nbsp;soi.</Text>
          </Text>

          <View
            key={slideIndex}
            accessibilityLiveRegion="polite"
            className="mt-6"
            style={{ minHeight: 132 }}
          >
            <Text
              className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.16em]"
              style={{ color: palette.sageDeep }}
            >
              · {currentSlide.kicker}
            </Text>
            <Text
              className="mb-2 font-serif text-[22px] leading-[1.15]"
              style={{ color: palette.ink }}
            >
              {currentSlide.title}
            </Text>
            <Text
              className="text-[13.5px] leading-[1.5]"
              style={{ color: palette.inkSoft, maxWidth: 320 }}
            >
              {currentSlide.body}
            </Text>
          </View>

          <View className="mt-4 flex-row gap-[5px]">
            {SLIDES.map((slide, i) => {
              const isActive = i === slideIndex;
              return (
                <Pressable
                  key={slide.kicker}
                  onPress={() => {
                    // No-op for now: dots are decorative + clickable; rotation owns state.
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Aller au slide ${i + 1}: ${slide.kicker}`}
                  accessibilityState={{ selected: isActive }}
                  testID={`home-slide-dot-${i}`}
                  hitSlop={12}
                  style={{
                    width: isActive ? 22 : 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: isActive ? palette.ink : `${palette.ink}26`,
                  }}
                />
              );
            })}
          </View>
        </View>

        <View className="absolute bottom-14 left-5 right-5 gap-4">
          <Pressable
            onPress={handleStart}
            accessibilityRole="button"
            accessibilityLabel="Commencer en silence"
            accessibilityHint="Lance le premier exercice de respiration"
            testID="home-cta-start"
            style={({ pressed }) => ({
              height: 56,
              borderRadius: 28,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: palette.ink,
              opacity: pressed ? 0.85 : 1,
              shadowColor: palette.ink,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.18,
              shadowRadius: 24,
              elevation: 6,
            })}
          >
            <Text
              className="text-[15px] font-medium tracking-[0.1px]"
              style={{ color: palette.cream }}
            >
              Commencer en silence
            </Text>
          </Pressable>

          <View className="flex-row justify-center gap-1">
            <Text className="text-[13px]" style={{ color: palette.inkSoft }}>
              Vous avez déjà un compte ?
            </Text>
            <Pressable
              onPress={handleSignIn}
              accessibilityRole="link"
              accessibilityLabel="Se connecter"
              testID="home-link-signin"
              hitSlop={6}
            >
              <Text
                className="text-[13px] font-medium underline"
                style={{ color: palette.ink, textDecorationLine: "underline" }}
              >
                Se connecter
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
