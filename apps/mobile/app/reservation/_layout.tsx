import { Stack } from 'expo-router';

export default function ReservationLayout() {
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
