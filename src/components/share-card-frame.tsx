import { Platform, StyleSheet, Text, View } from 'react-native';

export const monoFont = Platform.select({ ios: 'Courier New', default: 'monospace' });

/** The chrome every branded share card wears — wordmark, a tag pill, the
 * author row, and the footer — captured off-screen with
 * react-native-view-shot and attached as an image when a post or a ranked
 * result is shared externally. Deliberately NOT theme-aware: this is a
 * brand asset that leaves the app, so it must look the same regardless of
 * the sharer's own light/dark setting, same posture as the transactional
 * emails. Built at 360×640 and captured at 1080×1920 by each call site,
 * so the RN style numbers stay ordinary to read and write. */
export function ShareCardFrame({
  viewRef,
  tag,
  authorInitial,
  authorName,
  authorSub,
  footerSub = 'air-rally.com',
  children,
}: {
  viewRef: React.RefObject<View | null>;
  tag: string;
  authorInitial: string;
  authorName: string;
  authorSub: string;
  footerSub?: string;
  children: React.ReactNode;
}) {
  return (
    <View ref={viewRef} style={frameStyles.card} collapsable={false}>
      <View style={frameStyles.top}>
        <Text style={frameStyles.wordmark}>
          AIR<Text style={frameStyles.wordmarkAccent}>/Rally</Text>
        </Text>
        <View style={frameStyles.tag}>
          <Text style={frameStyles.tagText}>{tag}</Text>
        </View>
      </View>

      <View style={frameStyles.body}>
        <View style={frameStyles.authorRow}>
          <View style={frameStyles.avatarDot}>
            <Text style={frameStyles.avatarInitial}>{authorInitial}</Text>
          </View>
          <View>
            <Text style={frameStyles.authorName}>{authorName}</Text>
            <Text style={frameStyles.authorSub}>{authorSub}</Text>
          </View>
        </View>

        {children}
      </View>

      <View style={frameStyles.footer}>
        <Text style={frameStyles.footerTitle}>Play More. Rally More.</Text>
        <Text style={frameStyles.footerSub}>{footerSub}</Text>
      </View>
    </View>
  );
}

// Fixed brand palette, not theme tokens — see this file's own comment.
export const frameStyles = StyleSheet.create({
  card: {
    width: 360,
    height: 640,
    backgroundColor: '#0f2747',
    justifyContent: 'space-between',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  wordmark: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: '#ffffff',
  },
  wordmarkAccent: {
    color: '#ff8a3d',
  },
  tag: {
    borderWidth: 1,
    borderColor: 'rgba(255,138,61,0.5)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: {
    fontFamily: monoFont,
    fontSize: 9,
    letterSpacing: 1.2,
    color: '#ff8a3d',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 14,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  avatarDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3700f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: monoFont,
    fontWeight: '700',
    fontSize: 12,
    color: '#0f2747',
  },
  authorName: {
    fontWeight: '700',
    fontSize: 13,
    color: '#f3ead9',
  },
  authorSub: {
    fontSize: 10.5,
    color: '#93a2b8',
    marginTop: 1,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderTopWidth: 1,
    borderTopColor: 'rgba(243,234,217,0.14)',
  },
  footerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f3ead9',
  },
  footerSub: {
    fontSize: 11,
    color: '#cfd8e4',
    marginTop: 2,
  },
});
