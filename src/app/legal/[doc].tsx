import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CURRENT_AGREEMENT_VERSION } from '@/lib/legal';
import { PRIVACY, TERMS, type LegalDocument } from '@/lib/legalContent';

const DOCS: Record<string, LegalDocument> = { terms: TERMS, privacy: PRIVACY };

/**
 * Renders the actual text of the User Agreement / Privacy Policy in the
 * app, rather than just naming them next to a checkbox — port of the
 * web's /terms and /privacy pages (see components/legal/LegalDocumentView
 * there), same word-for-word content.
 */
export default function LegalDocumentScreen() {
  const theme = useTheme();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const document = DOCS[doc ?? ''] ?? TERMS;
  const otherKey = document === TERMS ? 'privacy' : 'terms';
  const otherTitle = document === TERMS ? 'Privacy Policy' : 'User Agreement';

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: document.title, headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="heading">{document.title}</ThemedText>
          <ThemedText type="small" themeColor="mutedForeground">
            {document === TERMS ? `Version ${CURRENT_AGREEMENT_VERSION} · ` : ''}Last updated 23 August 2026
          </ThemedText>

          {document.intro.map((paragraph, i) => (
            <ThemedText key={i} type="small">
              {paragraph}
            </ThemedText>
          ))}

          {document.sections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <ThemedText type="subtitle">{section.heading}</ThemedText>
              {section.body.map((paragraph, i) => (
                <ThemedText key={i} type="small" themeColor="subtle">
                  {paragraph}
                </ThemedText>
              ))}
            </View>
          ))}

          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <ThemedText type="small" themeColor="subtle">
              See also{' '}
              <ThemedText
                type="small"
                themeColor="primary"
                onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: otherKey } })}>
                the {otherTitle}
              </ThemedText>
              .
            </ThemedText>
          </View>
        </ScrollView>
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
  scroll: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  section: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: Spacing.three,
    marginTop: Spacing.three,
  },
});
