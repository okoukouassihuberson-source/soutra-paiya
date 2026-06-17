import { Stack } from 'expo-router';

export default function HotelLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="[venueId]" />
    </Stack>
  );
}
