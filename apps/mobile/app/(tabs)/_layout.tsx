// Remplace apps/mobile/app/(tabs)/_layout.tsx
//
// Cinq onglets : Accueil, Explorer, Activités, SoutraPay, Moi.
// Changements par rapport à l'existant :
//   + index.tsx        nouvel écran Accueil (découverte, catégories, communauté)
//   ~ tickets.tsx   →  activity.tsx      (« Billets » devient « Activités »)
//   ~ wallet.tsx       libellé « Soutra-Pay » → « SoutraPay »
//   − social.tsx       sort de la barre d'onglets, devient la route /feed
//                      poussée depuis l'accueil (« La communauté → Tout voir »)
//
// PRÉREQUIS avant de lancer un build — sinon expo-router lève sur des routes absentes :
//   1. créer app/(tabs)/index.tsx
//   2. git mv app/(tabs)/tickets.tsx app/(tabs)/activity.tsx
//   3. git mv app/(tabs)/social.tsx  app/feed.tsx
//   4. expo start --clear  (régénère les types de typedRoutes)

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, touch } from '@soutra/shared';
import { useColors } from '@/lib/theme';

export default function TabsLayout() {
  // Palette au runtime, pas d'import statique : la barre doit suivre le mode sombre.
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary[500],
        tabBarInactiveTintColor: c.ink.faint,
        tabBarStyle: {
          backgroundColor: c.surface.card,
          borderTopColor: c.surface.hairline,
          height: touch.tabBarHeight,
          paddingTop: 10,
          paddingBottom: 16,
        },
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontFamily: typography.fontFamily.semibold,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explorer',
          tabBarIcon: ({ color, size }) => <Ionicons name="compass-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activités',
          tabBarIcon: ({ color, size }) => <Ionicons name="bookmark-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'SoutraPay',
          tabBarIcon: ({ color, size }) => <Ionicons name="card-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Moi',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
