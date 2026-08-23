import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet } from 'react-native';

import { ReportSheet } from '@/components/report-sheet';
import { useTheme } from '@/hooks/use-theme';
import { useToast } from '@/components/ui/toast';
import { blockUser } from '@/lib/blocks';
import type { ReportTargetType } from '@/lib/database.types';
import { useSession } from '@/providers/session';

/**
 * The moderation trigger for a whole screen — "…" in the navigation bar,
 * opening a menu of actions, plus the sheets/dialogs those actions lead
 * to.
 *
 * `blockTarget` is a SEPARATE identity from `targetId` on purpose: what
 * gets reported is the content (a post, a comment, a club, a game), but
 * what gets blocked is always a PERSON — the author, the club's owner,
 * the event's organiser, or the profile itself. user_blocks only ever
 * names a person; there is no such thing as blocking a club. Omitting
 * `blockTarget` (rather than requiring it) is deliberate too: a caller
 * that doesn't yet know the relevant person's identity — nothing forces
 * a screen to fetch one just to render this menu — gets Report alone
 * rather than a broken or wrongly-targeted Block entry.
 *
 * Native OS menus rather than a custom Modal, still: opens with no
 * mount/animation cost of our own, and someone reaching for Report is
 * often already distressed. Report stays first regardless of how many
 * items follow it.
 */
export function ReportAction({
  targetType,
  targetId,
  targetLabel,
  blockTarget,
}: {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  blockTarget?: { userId: string; displayName: string };
}) {
  const theme = useTheme();
  const { session } = useSession();
  const { show } = useToast();
  const [reporting, setReporting] = useState(false);
  const [blocking, setBlocking] = useState(false);

  const confirmBlock = () => {
    if (!blockTarget) return;
    const name = blockTarget.displayName;
    const body =
      `Neither of you will see the other's posts, comments, or likes, and any follow between you is removed.\n\n` +
      `You'll still see each other on a game or club you already share — so nobody's caught unaware at the court.\n\n` +
      `${name} won't be told, and they'll still show up in search.`;
    Alert.alert(`Block ${name}?`, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: performBlock },
    ]);
  };

  const performBlock = async () => {
    if (!blockTarget) return;
    const myId = session?.user.id;
    if (!myId) {
      show('Sign in to block someone.', 'error');
      return;
    }
    setBlocking(true);
    try {
      await blockUser(myId, blockTarget.userId);
      // Confirms rather than staying silent — the same reason the
      // report sheet never closes quietly: a block that appeared to
      // work and didn't would leave someone believing they're
      // protected when they aren't.
      show(`${blockTarget.displayName} is blocked.`, 'success');
    } catch {
      show("We couldn't block them. Check your connection and try again.", 'error');
    } finally {
      setBlocking(false);
    }
  };

  const openMenu = () => {
    if (blocking) return;
    const options = blockTarget ? ['Report', 'Block', 'Cancel'] : ['Report', 'Cancel'];
    const cancelButtonIndex = options.length - 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex, destructiveButtonIndex: blockTarget ? 1 : undefined },
        (index) => {
          if (index === 0) setReporting(true);
          else if (blockTarget && index === 1) confirmBlock();
        }
      );
      return;
    }

    const buttons = [
      { text: 'Report', onPress: () => setReporting(true) },
      ...(blockTarget ? [{ text: 'Block', style: 'destructive' as const, onPress: confirmBlock }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ];
    Alert.alert('More options', undefined, buttons);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`More options for this ${targetLabel}`}
        onPress={openMenu}
        hitSlop={8}
        style={styles.trigger}>
        <Ionicons name="ellipsis-horizontal" size={20} color={theme.foreground} />
      </Pressable>

      <ReportSheet
        visible={reporting}
        onClose={() => setReporting(false)}
        targetType={targetType}
        targetId={targetId}
        targetLabel={targetLabel}
      />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    padding: 4,
  },
});
