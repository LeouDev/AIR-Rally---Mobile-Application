import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Club } from '@/lib/database.types';
import { createClub } from '@/lib/clubs';
import { useSession } from '@/providers/session';

const SKILL_OPTIONS: { value: Club['skill_level']; label: string }[] = [
  { value: 'mixed', label: 'All levels' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const TYPE_OPTIONS: { value: Club['club_type']; label: string }[] = [
  { value: 'social', label: 'Social' },
  { value: 'competitive', label: 'Competitive' },
  { value: 'training', label: 'Training' },
  { value: 'casual', label: 'Casual' },
];

const VISIBILITY_OPTIONS: { value: Club['visibility']; label: string }[] = [
  { value: 'public', label: 'Public — anyone can join instantly' },
  { value: 'approval_required', label: 'Approval required — you review each request' },
  { value: 'private', label: 'Private — invite only' },
];

function ChoiceRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onChange(option.value)}
            hitSlop={4}
            style={({ pressed }) => [
              styles.choice,
              {
                backgroundColor: active ? theme.secondary : theme.card,
                borderColor: active ? theme.secondary : theme.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}>
            <ThemedText type="small" style={{ color: active ? theme.secondaryForeground : theme.foreground }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function NewClubScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [skillLevel, setSkillLevel] = useState<Club['skill_level']>('mixed');
  const [clubType, setClubType] = useState<Club['club_type']>('social');
  const [visibility, setVisibility] = useState<Club['visibility']>('public');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!userId || !name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const club = await createClub(userId, {
        name: name.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        skillLevel,
        clubType,
        visibility,
      });
      router.replace({ pathname: '/clubs/[id]', params: { id: club.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't create that club.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Create a club', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <TextField label="Club name" value={name} onChangeText={setName} maxLength={120} placeholder="e.g. Weekend Warriors" />
            <TextField
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              maxLength={2000}
              multiline
              numberOfLines={3}
              style={styles.multiline}
            />
            <TextField label="Location (optional)" value={location} onChangeText={setLocation} maxLength={120} placeholder="e.g. Quezon City" />

            <View style={styles.block}>
              <ThemedText type="smallBold">Skill level</ThemedText>
              <ChoiceRow options={SKILL_OPTIONS} value={skillLevel} onChange={setSkillLevel} />
            </View>

            <View style={styles.block}>
              <ThemedText type="smallBold">Club type</ThemedText>
              <ChoiceRow options={TYPE_OPTIONS} value={clubType} onChange={setClubType} />
            </View>

            <View style={styles.block}>
              <ThemedText type="smallBold">Visibility</ThemedText>
              <View style={styles.visibilityList}>
                {VISIBILITY_OPTIONS.map((option) => {
                  const active = option.value === visibility;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      onPress={() => setVisibility(option.value)}
                      style={[
                        styles.visibilityRow,
                        { backgroundColor: active ? theme.accent : theme.card, borderColor: active ? theme.primary : theme.border },
                      ]}>
                      <ThemedText type="small">{option.label}</ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {error ? (
              <ThemedText type="small" themeColor="destructive">
                {error}
              </ThemedText>
            ) : null}

            <Button title={submitting ? 'Creating…' : 'Create club'} onPress={submit} disabled={!name.trim() || submitting} loading={submitting} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: Spacing.two,
  },
  block: {
    gap: Spacing.two,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  choice: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  visibilityList: {
    gap: Spacing.two,
  },
  visibilityRow: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
  },
});
