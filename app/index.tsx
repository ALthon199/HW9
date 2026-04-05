import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const HIGH_SCORE_KEY = "slope.highScore";

export default function MenuScreen() {
  const router = useRouter();
  const [highScore, setHighScore] = useState(0);

  const navigateToGame = () => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const active = document.activeElement as HTMLElement | null;
      active?.blur();
    }

    requestAnimationFrame(() => {
      router.push("/game");
    });
  };

  useEffect(() => {
    const loadHighScore = async () => {
      try {
        const raw = await AsyncStorage.getItem(HIGH_SCORE_KEY);
        const parsed = raw ? Number.parseInt(raw, 10) : 0;
        setHighScore(Number.isFinite(parsed) ? parsed : 0);
      } catch {
        setHighScore(0);
      }
    };

    void loadHighScore();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>SLOPE</Text>
        <Text style={styles.subtitle}>Tilt your phone to steer the ball.</Text>

        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>Best Score</Text>
          <Text style={styles.scoreValue}>{highScore}</Text>
        </View>

        <Pressable style={styles.startButton} onPress={navigateToGame}>
          <Text style={styles.startText}>Start Game</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#000000",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    backgroundColor: "#000000",
  },
  title: {
    color: "#00ff41",
    fontSize: 64,
    fontWeight: "900",
    letterSpacing: 6,
    marginBottom: 8,
  },
  subtitle: {
    color: "#D6DEE4",
    fontSize: 16,
    marginBottom: 32,
  },
  scoreCard: {
    width: "100%",
    maxWidth: 300,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#004d15",
    backgroundColor: "#0a0a0a",
    padding: 16,
    marginBottom: 24,
    alignItems: "center",
    gap: 6,
  },
  scoreLabel: {
    color: "#00cc33",
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  scoreValue: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "700",
  },
  startButton: {
    backgroundColor: "#D2FF4D",
    borderRadius: 16,
    width: "100%",
    maxWidth: 300,
    paddingVertical: 18,
    alignItems: "center",
  },
  startText: {
    color: "#030507",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
