import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createListingComment, fetchListingComments, toggleCommentFeedback } from '../api';
import { shadow, theme } from '../theme';
import { AppComment, AppUser, CreateAppCommentInput, LocalUploadImage } from '../types';
import { IconButton, useJellyPressAnimation } from './Primitives';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

const APP_LOGO = require('../../logo.png');
const PREVIEW_REPLY_LIMIT = 2;
const MAX_ATTACHMENTS = 3;
const COMMENT_REPLY_THRESHOLD = 72;

type CommentRow =
  | {
      key: string;
      type: 'comment';
      comment: AppComment;
      level: number;
    }
  | {
      key: string;
      type: 'more-replies';
      parentId: string;
      level: number;
      remaining: number;
    }
  | {
      key: string;
      type: 'reply-loading';
      parentId: string;
      level: number;
    };

export function CommentsSheet({
  eventId,
  visible,
  totalCount,
  profile,
  onClose,
  onCountChange,
}: {
  eventId: string;
  visible: boolean;
  totalCount: number;
  profile: AppUser | null;
  onClose: () => void;
  onCountChange: (nextCount: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const animation = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const [mounted, setMounted] = useState(visible);
  const [comments, setComments] = useState<AppComment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsLoadingMore, setCommentsLoadingMore] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [nextTopLevelPage, setNextTopLevelPage] = useState<number | null>(null);
  const [replyTarget, setReplyTarget] = useState<AppComment | null>(null);
  const [replyLoadingMap, setReplyLoadingMap] = useState<Record<string, boolean>>({});
  const [replyNextPageMap, setReplyNextPageMap] = useState<Record<string, number | null>>({});
  const [composerText, setComposerText] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerAttachments, setComposerAttachments] = useState<LocalUploadImage[]>([]);
  const [composerFocused, setComposerFocused] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [commentCount, setCommentCount] = useState(totalCount);

  useEffect(() => {
    setComments([]);
    setCommentsLoaded(false);
    setCommentsLoading(false);
    setCommentsLoadingMore(false);
    setCommentsError(null);
    setNextTopLevelPage(null);
    setReplyTarget(null);
    setReplyLoadingMap({});
    setReplyNextPageMap({});
    setComposerText('');
    setComposerError(null);
    setComposerAttachments([]);
    setComposerFocused(false);
    setCommentCount(totalCount);
  }, [eventId, totalCount]);

  useEffect(() => {
    setCommentCount(totalCount);
  }, [totalCount]);

  const animateSheet = useCallback(
    (toValue: number, onEnd?: () => void) => {
      Animated.parallel([
        Animated.timing(animation, {
          toValue,
          duration: toValue === 1 ? 260 : 220,
          easing: toValue === 1 ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && onEnd) {
          onEnd();
        }
      });
    },
    [animation],
  );

  const loadTopLevelComments = useCallback(
    async (page: number, append: boolean) => {
      if (append) {
        setCommentsLoadingMore(true);
      } else {
        setCommentsLoading(true);
        setCommentsError(null);
      }

      try {
        const payload = await fetchListingComments({
          listingId: eventId,
          page,
          replyPreviewLimit: PREVIEW_REPLY_LIMIT,
        });

        setComments((current) => (append ? mergeCommentNodes(current, payload.comments) : payload.comments));
        setNextTopLevelPage(payload.nextPage);
        setCommentsLoaded(true);
      } catch (error) {
        if (!append) {
          setCommentsError('Comments could not load right now.');
        }
      } finally {
        setCommentsLoading(false);
        setCommentsLoadingMore(false);
      }
    },
    [eventId],
  );

  const loadReplyPage = useCallback(
    async (parentId: string, replacePreview: boolean) => {
      const nextPage = replacePreview ? 1 : replyNextPageMap[parentId] ?? 1;
      if (replyLoadingMap[parentId]) {
        return;
      }

      setReplyLoadingMap((current) => ({ ...current, [parentId]: true }));

      try {
        const payload = await fetchListingComments({
          listingId: eventId,
          parentId,
          page: nextPage,
          replyPreviewLimit: PREVIEW_REPLY_LIMIT,
        });

        setComments((current) =>
          replacePreview
            ? replaceRepliesInThread(current, parentId, payload.comments)
            : appendRepliesInThread(current, parentId, payload.comments),
        );
        setReplyNextPageMap((current) => ({ ...current, [parentId]: payload.nextPage }));
      } catch (error) {
        setComposerError('Replies could not load right now.');
      } finally {
        setReplyLoadingMap((current) => ({ ...current, [parentId]: false }));
      }
    },
    [eventId, replyLoadingMap, replyNextPageMap],
  );

  useEffect(() => {
    if (visible) {
      setMounted(true);
      animateSheet(1);

      if (!commentsLoaded && !commentsLoading) {
        void loadTopLevelComments(1, false);
      }
      return;
    }

    if (mounted) {
      inputRef.current?.blur();
      animateSheet(0, () => setMounted(false));
    }
  }, [animateSheet, commentsLoaded, commentsLoading, loadTopLevelComments, mounted, visible]);

  const focusComposer = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
  }, []);

  const openReplyTarget = useCallback(
    (comment: AppComment) => {
      setReplyTarget(comment);
      setComposerError(null);
      focusComposer();
    },
    [focusComposer],
  );

  const handlePickAttachments = useCallback(async () => {
    setComposerError(null);

    if (composerAttachments.length >= MAX_ATTACHMENTS) {
      setComposerError(`You can attach up to ${MAX_ATTACHMENTS} files per comment.`);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setComposerError('Media access is required to attach files.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      allowsMultipleSelection: true,
      mediaTypes: ['images', 'videos'],
      quality: 0.9,
      selectionLimit: MAX_ATTACHMENTS - composerAttachments.length,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const next = result.assets
      .slice(0, MAX_ATTACHMENTS - composerAttachments.length)
      .map((asset, index) => toLocalUploadImage(asset, composerAttachments.length + index));

    setComposerAttachments((current) => [...current, ...next].slice(0, MAX_ATTACHMENTS));
  }, [composerAttachments.length]);

  const handleSendComment = useCallback(async () => {
    if (sendingComment) {
      return;
    }

    const payload: CreateAppCommentInput = {
      listingId: eventId,
      parentId: replyTarget?.id ?? null,
      message: composerText.trim(),
      attachments: composerAttachments,
    };

    if (!payload.message && payload.attachments.length === 0) {
      return;
    }

    setSendingComment(true);
    setComposerError(null);

    try {
      const created = await createListingComment(payload);
      const nextCount = commentCount + 1;

      setCommentCount(nextCount);
      onCountChange(nextCount);
      setComposerText('');
      setComposerAttachments([]);
      setReplyTarget(null);

      setComments((current) =>
        payload.parentId ? insertReplyIntoThread(current, payload.parentId, created) : [created, ...current]
      );
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : 'Your comment could not be sent right now.');
    } finally {
      setSendingComment(false);
    }
  }, [commentCount, composerAttachments, composerText, eventId, onCountChange, replyTarget, sendingComment]);

  const handleCommentFeedback = useCallback(async (comment: AppComment, vote: NonNullable<AppComment['userFeedback']>) => {
    setComposerError(null);
    try {
      const result = await toggleCommentFeedback(comment.id, vote);
      setComments((current) => updateCommentFeedbackInThread(current, result.commentId, {
        usefulCount: result.usefulCount,
        notUsefulCount: result.notUsefulCount,
        userFeedback: result.userFeedback,
      }));
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : 'Feedback could not be saved right now.');
    }
  }, []);

  const commentRows = useMemo(() => buildCommentRows(comments, replyLoadingMap), [comments, replyLoadingMap]);
  const avatarSource = profile?.avatar ? profile.avatar : APP_LOGO;
  const isInitialLoading = commentsLoading && !commentsLoaded;
  const composerExpanded = composerFocused;

  if (!mounted) {
    return null;
  }

  return (
    <Modal animationType="none" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={styles.modalRoot}>
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: animation.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
              }),
            },
          ]}
        >
          <Pressable onPress={onClose} style={StyleSheet.absoluteFillObject} />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
          style={styles.modalRoot}
        >
          <Animated.View
            style={[
              styles.sheet,
              {
                maxHeight: Math.min(height * 0.86, 760),
                paddingBottom: Math.max(insets.bottom, 12),
                opacity: animation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.88, 1],
                }),
                transform: [
                  {
                    translateY: animation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [Math.min(height * 0.7, 560), 0],
                    }),
                  },
                  {
                    scaleY: animation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text style={styles.headerTitle}>Comments</Text>
                <Text style={styles.headerMeta}>{formatCommentCount(commentCount)}</Text>
              </View>

              <IconButton icon="x" onPress={onClose} accessibilityLabel="Close comments" />
            </View>

            <View style={styles.headerDivider} />

            {isInitialLoading ? (
              <ScrollView
                contentContainerStyle={styles.commentListContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <CommentSkeletonList />
              </ScrollView>
            ) : (
              <FlatList<CommentRow>
                contentContainerStyle={styles.commentListContent}
                data={commentRows}
                keyExtractor={(item) => item.key}
                keyboardShouldPersistTaps="handled"
                onEndReached={() => {
                  if (!commentsLoadingMore && nextTopLevelPage) {
                    void loadTopLevelComments(nextTopLevelPage, true);
                  }
                }}
                onEndReachedThreshold={0.32}
                renderItem={({ item, index }) => {
                  const nextItem = commentRows[index + 1];

                  if (item.type === 'more-replies') {
                    return (
                      <LoadMoreRepliesRow
                        level={item.level}
                        onPress={() =>
                          void loadReplyPage(item.parentId, replyNextPageMap[item.parentId] === undefined)
                        }
                        remaining={item.remaining}
                      />
                    );
                  }

                  if (item.type === 'reply-loading') {
                    return <ReplyLoadingRow level={item.level} />;
                  }

                  return (
                    <SwipeReplyCommentCard
                      comment={item.comment}
                      continuesThreadBelow={
                        item.level > 0 &&
                        !!nextItem &&
                        nextItem.type === 'comment' &&
                        nextItem.level >= item.level
                      }
                      level={item.level}
                      onOpenAttachment={(url) => {
                        void openExternal(url);
                      }}
                      onReply={openReplyTarget}
                      onFeedback={handleCommentFeedback}
                    />
                  );
                }}
                ListEmptyComponent={
                  commentsError ? (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyTitle}>Comments are not available yet</Text>
                      <Text style={styles.emptyText}>{commentsError}</Text>
                      <ActionTextButton label="Try again" onPress={() => void loadTopLevelComments(1, false)} />
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyTitle}>Be the first to say something</Text>
                      <Text style={styles.emptyText}>Comments and replies will show up here as people join the thread.</Text>
                    </View>
                  )
                }
                ListFooterComponent={
                  commentsLoadingMore ? (
                    <View style={styles.loadingFooter}>
                      <ActivityIndicator color={theme.colors.accentStrong} />
                    </View>
                  ) : (
                    <View style={styles.listBottomSpacer} />
                  )
                }
                showsVerticalScrollIndicator={false}
              />
            )}

            <View style={styles.composerDivider} />

            <View style={styles.composerShell}>
              {replyTarget ? (
                <View style={styles.replyTargetBanner}>
                  <View style={styles.replyTargetCopy}>
                    <Text style={styles.replyTargetLabel}>Replying to {replyTarget.user.name}</Text>
                    <Text numberOfLines={1} style={styles.replyTargetPreview}>
                      {replyTarget.message || 'Attachment reply'}
                    </Text>
                  </View>
                  <ActionIconButton icon="x" onPress={() => setReplyTarget(null)} />
                </View>
              ) : null}

              {composerAttachments.length > 0 ? (
                <ScrollView
                  contentContainerStyle={styles.attachmentPreviewRow}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {composerAttachments.map((attachment, index) => (
                    <ComposerAttachmentCard
                      key={`${attachment.uri}-${index}`}
                      attachment={attachment}
                      onRemove={() =>
                        setComposerAttachments((current) => current.filter((item) => item.uri !== attachment.uri))
                      }
                    />
                  ))}
                </ScrollView>
              ) : null}

              <View style={[styles.composerRow, composerExpanded && styles.composerRowExpanded]}>
                <View style={styles.composerAvatar}>
                  <Image contentFit="cover" source={avatarSource} style={styles.composerAvatarImage} transition={120} />
                </View>

                <View style={[styles.composerField, composerExpanded && styles.composerFieldExpanded]}>
                  <TextInput
                    multiline
                    onBlur={() => setComposerFocused(false)}
                    onChangeText={(value) => {
                      setComposerError(null);
                      setComposerText(value);
                    }}
                    onFocus={() => setComposerFocused(true)}
                    placeholder="Share your thoughts"
                    placeholderTextColor={theme.colors.textSoft}
                    ref={inputRef}
                    style={[styles.composerInput, composerExpanded && styles.composerInputExpanded]}
                    value={composerText}
                  />
                </View>

                <ActionIconButton icon="paperclip" onPress={() => void handlePickAttachments()} />
                <SendButton disabled={sendingComment || (!composerText.trim() && composerAttachments.length === 0)} loading={sendingComment} onPress={() => void handleSendComment()} />
              </View>

              {composerError ? <Text style={styles.composerError}>{composerError}</Text> : null}
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function SwipeReplyCommentCard({
  comment,
  continuesThreadBelow,
  level,
  onOpenAttachment,
  onFeedback,
  onReply,
}: {
  comment: AppComment;
  continuesThreadBelow: boolean;
  level: number;
  onOpenAttachment: (url: string) => void;
  onFeedback: (comment: AppComment, vote: NonNullable<AppComment['userFeedback']>) => void;
  onReply: (comment: AppComment) => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;

  const settleBack = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      stiffness: 260,
      damping: 22,
      mass: 0.86,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.dx > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) + 6,
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx > 0) {
            translateX.setValue(Math.min(gestureState.dx, 88));
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          const shouldReply = gestureState.dx >= COMMENT_REPLY_THRESHOLD;
          settleBack();
          if (shouldReply) {
            onReply(comment);
          }
        },
        onPanResponderTerminate: () => {
          settleBack();
        },
      }),
    [comment, onReply, settleBack, translateX],
  );

  const indent = Math.min(level, 3) * 18;

  return (
    <View style={[styles.threadRow, { marginLeft: indent }]}>
      {level > 0 ? (
        <View pointerEvents="none" style={styles.replyGuideWrap}>
          <View style={[styles.replyGuideVertical, continuesThreadBelow && styles.replyGuideVerticalContinues]} />
          <View style={styles.replyGuideHorizontal} />
        </View>
      ) : null}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.replyCue,
          {
            opacity: translateX.interpolate({
              inputRange: [0, 20, COMMENT_REPLY_THRESHOLD],
              outputRange: [0, 0.36, 1],
            }),
            transform: [
              {
                scale: translateX.interpolate({
                  inputRange: [0, COMMENT_REPLY_THRESHOLD],
                  outputRange: [0.92, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Feather color={theme.colors.accentStrong} name={'corner-down-right' as FeatherName} size={14} />
        <Text style={styles.replyCueText}>Reply</Text>
      </Animated.View>

      <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }] }}>
        <View style={[styles.commentCard, comment.isPinned && styles.commentCardPinned]}>
          <View style={styles.commentHeader}>
            <View style={styles.commentUserRow}>
              <View style={styles.commentAvatar}>
                <Image
                  contentFit="cover"
                  source={comment.user.avatar ? comment.user.avatar : APP_LOGO}
                  style={styles.commentAvatarImage}
                  transition={120}
                />
              </View>

              <View style={styles.commentIdentity}>
                <View style={styles.commentNameRow}>
                  <Text numberOfLines={1} style={styles.commentName}>
                    {comment.user.name}
                  </Text>
                  {comment.isPinned ? <Text style={styles.commentPinnedText}>Pinned</Text> : null}
                  {comment.isEdited ? <Text style={styles.commentEditedText}>Edited</Text> : null}
                </View>
                <Text style={styles.commentTimestamp}>{formatRelativeTime(comment.createdAt)}</Text>
              </View>
            </View>
          </View>

          {comment.parentAuthor ? (
            <Text numberOfLines={1} style={styles.parentAuthorText}>
              Replying to {comment.parentAuthor}
            </Text>
          ) : null}

          {comment.message ? <Text style={styles.commentMessage}>{comment.message}</Text> : null}

          {comment.attachments.length > 0 ? (
            <View style={styles.commentAttachmentWrap}>
              {comment.attachments.map((attachment) => (
                <CommentAttachmentCard key={attachment.id} attachment={attachment} onOpenAttachment={onOpenAttachment} />
              ))}
            </View>
          ) : null}

          <View style={styles.commentFooter}>
            <ActionTextButton label="Reply" onPress={() => onReply(comment)} />
            <View style={styles.commentFeedbackGroup}>
              <CommentFeedbackButton
                active={comment.userFeedback === 'useful'}
                count={comment.usefulCount}
                icon="thumbs-up"
                label="Useful"
                onPress={() => onFeedback(comment, 'useful')}
              />
              <CommentFeedbackButton
                active={comment.userFeedback === 'not_useful'}
                count={comment.notUsefulCount}
                icon="thumbs-down"
                label="Not useful"
                onPress={() => onFeedback(comment, 'not_useful')}
              />
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

function CommentAttachmentCard({
  attachment,
  onOpenAttachment,
}: {
  attachment: AppComment['attachments'][number];
  onOpenAttachment: (url: string) => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.04,
    pressedScaleY: 0.94,
  });
  const url = attachment.fileUrl ?? attachment.thumbnailUrl ?? attachment.url ?? null;

  if (attachment.type === 'image' && url) {
    return (
      <Pressable
        onPress={() => onOpenAttachment(url)}
        onPressIn={jelly.onPressIn}
        onPressOut={jelly.onPressOut}
        style={styles.commentAttachmentPressable}
      >
        <Animated.View style={[styles.commentImageAttachment, jelly.animatedStyle]}>
          <Image contentFit="cover" source={url} style={StyleSheet.absoluteFillObject} transition={160} />
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => {
        if (url) {
          onOpenAttachment(url);
        }
      }}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.commentAttachmentPressable}
    >
      <Animated.View style={[styles.commentFileAttachment, jelly.animatedStyle]}>
        <MaterialCommunityIcons
          color={theme.colors.accentStrong}
          name={attachment.type === 'video' ? 'play-circle-outline' : 'link-variant'}
          size={18}
        />
        <Text numberOfLines={1} style={styles.commentFileAttachmentText}>
          {attachment.type === 'video' ? 'Video attachment' : attachment.title || 'Open attachment'}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function LoadMoreRepliesRow({
  level,
  onPress,
  remaining,
}: {
  level: number;
  onPress: () => void;
  remaining: number;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.02,
    pressedScaleY: 0.96,
  });

  return (
    <View style={[styles.moreRepliesWrap, { marginLeft: Math.min(level, 3) * 18 }]}>
      <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
        <Animated.View style={[styles.moreRepliesButton, jelly.animatedStyle]}>
          <Feather color={theme.colors.accentStrong} name={'chevrons-down' as FeatherName} size={13} />
          <Text style={styles.moreRepliesText}>
            {remaining > 0 ? `Read ${remaining} more repl${remaining === 1 ? 'y' : 'ies'}` : 'Read more replies'}
          </Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

function ReplyLoadingRow({ level }: { level: number }) {
  return (
    <View style={[styles.replyLoadingWrap, { marginLeft: Math.min(level, 3) * 18 }]}>
      <BreathingBlock height={62} radius={20} />
    </View>
  );
}

function ComposerAttachmentCard({
  attachment,
  onRemove,
}: {
  attachment: LocalUploadImage;
  onRemove: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.04,
    pressedScaleY: 0.94,
  });
  const isVideo = attachment.mimeType.startsWith('video/');

  return (
    <Animated.View style={[styles.composerAttachmentCard, jelly.animatedStyle]}>
      {isVideo ? (
        <View style={styles.composerVideoCard}>
          <MaterialCommunityIcons color={theme.colors.accentStrong} name="play-circle-outline" size={20} />
          <Text numberOfLines={1} style={styles.composerVideoText}>
            {attachment.name}
          </Text>
        </View>
      ) : (
        <Image contentFit="cover" source={attachment.uri} style={styles.composerAttachmentImage} transition={120} />
      )}

      <Pressable onPress={onRemove} style={styles.composerAttachmentRemove}>
        <Feather color={theme.colors.white} name={'x' as FeatherName} size={12} />
      </Pressable>
    </Animated.View>
  );
}

function CommentSkeletonList() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.skeletonCard}>
          <View style={styles.skeletonHeader}>
            <BreathingBlock height={36} radius={18} width={36} />
            <View style={styles.skeletonHeaderCopy}>
              <BreathingBlock height={14} radius={10} width="46%" />
              <BreathingBlock height={12} radius={10} width="28%" />
            </View>
          </View>
          <BreathingBlock height={16} radius={10} width="94%" />
          <BreathingBlock height={16} radius={10} width="86%" />
          {index === 0 ? (
            <View style={styles.skeletonReplyInset}>
              <BreathingBlock height={60} radius={18} />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function BreathingBlock({
  height,
  radius,
  width = '100%',
}: {
  height: number;
  radius: number;
  width?: number | string;
}) {
  const motion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, {
          toValue: 1,
          duration: 1250,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(motion, {
          toValue: 0,
          duration: 1250,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [motion]);

  return (
    <Animated.View
      style={[
        {
          width: width as never,
          height,
          borderRadius: radius,
          backgroundColor: 'rgba(255,255,255,0.08)',
        },
        {
          opacity: motion.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0.36, 0.76, 0.42],
          }),
          transform: [
            {
              scaleX: motion.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.992, 1.01, 0.996],
              }),
            },
            {
              scaleY: motion.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [1.018, 0.992, 1.01],
              }),
            },
          ],
        },
      ]}
    />
  );
}

function ActionTextButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.04,
    pressedScaleY: 0.94,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
      <Animated.View style={jelly.animatedStyle}>
        <Text style={styles.actionText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function CommentFeedbackButton({
  active,
  count,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  count: number;
  icon: FeatherName;
  label: string;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.08,
    pressedScaleY: 0.9,
  });
  const hasCount = count > 0;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
      <Animated.View style={[styles.commentFeedbackButton, active && styles.commentFeedbackButtonActive, jelly.animatedStyle]}>
        <Feather color={active ? theme.colors.accentStrong : theme.colors.textSoft} name={icon} size={13} />
        {hasCount ? (
          <Text style={[styles.commentFeedbackCount, active && styles.commentFeedbackCountActive]}>
            {formatCompactCount(count)}
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

function ActionIconButton({
  icon,
  onPress,
}: {
  icon: FeatherName;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.08,
    pressedScaleY: 0.9,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut} style={styles.iconActionPressable}>
      <Animated.View style={[styles.iconActionButton, jelly.animatedStyle]}>
        <Feather color={theme.colors.textMuted} name={icon} size={15} />
      </Animated.View>
    </Pressable>
  );
}

function SendButton({
  disabled,
  loading,
  onPress,
}: {
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.05,
    pressedScaleY: 0.92,
  });

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.sendPressable}
    >
      <Animated.View style={[styles.sendButton, disabled && styles.sendButtonDisabled, jelly.animatedStyle]}>
        {loading ? (
          <ActivityIndicator color={theme.colors.white} size="small" />
        ) : (
          <Feather color={theme.colors.white} name={'send' as FeatherName} size={15} />
        )}
      </Animated.View>
    </Pressable>
  );
}

function mergeCommentNodes(current: AppComment[], incoming: AppComment[]) {
  const map = new Map(current.map((comment) => [comment.id, comment]));
  const merged = [...current];

  incoming.forEach((comment) => {
    const existingIndex = merged.findIndex((item) => item.id === comment.id);
    if (existingIndex === -1) {
      merged.push(comment);
      return;
    }

    const existing = map.get(comment.id) ?? merged[existingIndex];
    merged[existingIndex] = {
      ...existing,
      ...comment,
      replies: mergeCommentNodes(existing.replies, comment.replies),
    };
  });

  return merged;
}

function replaceRepliesInThread(comments: AppComment[], parentId: string, replies: AppComment[]): AppComment[] {
  return comments.map((comment) => {
    if (comment.id === parentId) {
      return {
        ...comment,
        replies,
      };
    }

    return {
      ...comment,
      replies: replaceRepliesInThread(comment.replies, parentId, replies),
    };
  });
}

function appendRepliesInThread(comments: AppComment[], parentId: string, replies: AppComment[]): AppComment[] {
  return comments.map((comment) => {
    if (comment.id === parentId) {
      return {
        ...comment,
        replies: mergeCommentNodes(comment.replies, replies),
      };
    }

    return {
      ...comment,
      replies: appendRepliesInThread(comment.replies, parentId, replies),
    };
  });
}

function insertReplyIntoThread(comments: AppComment[], parentId: string, reply: AppComment): AppComment[] {
  return comments.map((comment) => {
    if (comment.id === parentId) {
      return {
        ...comment,
        replyCount: comment.replyCount + 1,
        replies: [reply, ...comment.replies],
      };
    }

    return {
      ...comment,
      replies: insertReplyIntoThread(comment.replies, parentId, reply),
    };
  });
}

function updateCommentFeedbackInThread(
  comments: AppComment[],
  commentId: string,
  patch: Pick<AppComment, 'usefulCount' | 'notUsefulCount' | 'userFeedback'>,
): AppComment[] {
  return comments.map((comment) => {
    const nextComment = comment.id === commentId ? { ...comment, ...patch } : comment;
    if (nextComment.replies.length === 0) {
      return nextComment;
    }

    return {
      ...nextComment,
      replies: updateCommentFeedbackInThread(nextComment.replies, commentId, patch),
    };
  });
}

function buildCommentRows(comments: AppComment[], replyLoadingMap: Record<string, boolean>): CommentRow[] {
  const rows: CommentRow[] = [];

  const appendThread = (comment: AppComment, level: number) => {
    rows.push({
      key: `comment-${comment.id}`,
      type: 'comment',
      comment,
      level,
    });

    comment.replies.forEach((reply) => appendThread(reply, level + 1));

    const remaining = Math.max(comment.replyCount - comment.replies.length, 0);
    if (remaining > 0) {
      rows.push({
        key: `more-${comment.id}`,
        type: 'more-replies',
        parentId: comment.id,
        level: level + 1,
        remaining,
      });
    }

    if (replyLoadingMap[comment.id]) {
      rows.push({
        key: `loading-${comment.id}`,
        type: 'reply-loading',
        parentId: comment.id,
        level: level + 1,
      });
    }
  };

  comments.forEach((comment) => appendThread(comment, 0));
  return rows;
}

function formatCommentCount(count: number) {
  return `${formatCompactCount(count)} comment${count === 1 ? '' : 's'}`;
}

function formatCompactCount(count: number) {
  const safeCount = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  if (safeCount < 1000) {
    return String(safeCount);
  }

  const units = [
    { value: 1_000_000_000, suffix: 'B' },
    { value: 1_000_000, suffix: 'M' },
    { value: 1_000, suffix: 'k' },
  ];
  const unit = units.find((item) => safeCount >= item.value) ?? units[2];
  const value = safeCount / unit.value;
  const formatted = value >= 10 ? Math.floor(value).toString() : value.toFixed(1).replace(/\.0$/, '');
  return `${formatted}${unit.suffix}`;
}

function formatRelativeTime(timestamp: string) {
  const created = new Date(timestamp);
  if (Number.isNaN(created.getTime())) {
    return 'Now';
  }

  const now = new Date();
  const timeLabel = created.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (created.toDateString() === now.toDateString()) {
    return timeLabel;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (created.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${timeLabel}`;
  }

  if (created.getFullYear() === now.getFullYear()) {
    return `${created.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })}, ${timeLabel}`;
  }

  return created.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toLocalUploadImage(asset: ImagePicker.ImagePickerAsset, index: number): LocalUploadImage {
  const isVideo = asset.type === 'video' || asset.mimeType?.startsWith('video/');
  const extension = isVideo ? 'mp4' : 'jpg';
  const webFile =
    typeof File !== 'undefined'
      ? ((asset as ImagePicker.ImagePickerAsset & { file?: File | null }).file ?? null)
      : null;

  return {
    uri: asset.uri,
    name: asset.fileName ?? `comment-upload-${Date.now()}-${index}.${extension}`,
    mimeType: asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
    webFile,
  };
}

async function openExternal(url: string) {
  await Linking.openURL(url);
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,7,13,0.6)',
  },
  sheet: {
    marginHorizontal: 10,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: 'rgba(12,15,23,0.985)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    ...shadow,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 62,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginTop: 10,
    marginBottom: 14,
  },
  headerRow: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  headerDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  commentListContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
    gap: 12,
  },
  emptyState: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: 18,
    gap: 8,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  loadingFooter: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listBottomSpacer: {
    height: 8,
  },
  composerDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  composerShell: {
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 10,
  },
  replyTargetBanner: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(242,34,28,0.2)',
    backgroundColor: theme.colors.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  replyTargetCopy: {
    flex: 1,
    gap: 3,
  },
  replyTargetLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  replyTargetPreview: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  attachmentPreviewRow: {
    gap: 10,
    paddingBottom: 2,
  },
  composerAttachmentCard: {
    width: 82,
    height: 82,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  composerAttachmentImage: {
    width: '100%',
    height: '100%',
  },
  composerVideoCard: {
    flex: 1,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  composerVideoText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  composerAttachmentRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(10,13,19,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  composerRowExpanded: {
    alignItems: 'flex-end',
  },
  composerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  composerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  composerField: {
    flex: 1,
    minHeight: 42,
    maxHeight: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingTop: 0,
    paddingBottom: 0,
    justifyContent: 'center',
  },
  composerFieldExpanded: {
    minHeight: 86,
    maxHeight: 132,
    borderRadius: 22,
    paddingTop: 12,
    paddingBottom: 10,
    justifyContent: 'flex-start',
  },
  composerInput: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'center',
    minHeight: 20,
    maxHeight: 20,
  },
  composerInputExpanded: {
    minHeight: 56,
    maxHeight: 108,
    textAlignVertical: 'top',
  },
  composerError: {
    color: theme.colors.accentStrong,
    fontSize: 12,
    fontWeight: '600',
    paddingLeft: 48,
  },
  iconActionPressable: {
    alignSelf: 'flex-end',
  },
  iconActionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendPressable: {
    alignSelf: 'flex-end',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  threadRow: {
    position: 'relative',
    marginBottom: 12,
  },
  replyCue: {
    position: 'absolute',
    left: 12,
    top: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  replyCueText: {
    color: theme.colors.accentStrong,
    fontSize: 12,
    fontWeight: '800',
  },
  replyGuideWrap: {
    position: 'absolute',
    left: -10,
    top: 0,
    bottom: 0,
    width: 12,
  },
  replyGuideVertical: {
    position: 'absolute',
    left: 0,
    top: -2,
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.11)',
  },
  replyGuideVerticalContinues: {
    bottom: -12,
    height: undefined,
  },
  replyGuideHorizontal: {
    position: 'absolute',
    left: 0,
    top: 28,
    width: 10,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.11)',
  },
  commentCard: {
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  commentCardPinned: {
    borderColor: 'rgba(242,34,28,0.26)',
    backgroundColor: 'rgba(242,34,28,0.02)',
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  commentUserRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  commentAvatarImage: {
    width: '100%',
    height: '100%',
  },
  commentIdentity: {
    flex: 1,
    gap: 2,
  },
  commentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  commentName: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  commentPinnedText: {
    color: theme.colors.accentStrong,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  commentEditedText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  commentTimestamp: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  parentAuthorText: {
    color: theme.colors.accentStrong,
    fontSize: 12,
    fontWeight: '700',
  },
  commentMessage: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  commentAttachmentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  commentFooter: {
    paddingTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  commentFeedbackGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  commentFeedbackButton: {
    minWidth: 28,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'transparent',
  },
  commentFeedbackButtonActive: {
    borderColor: 'rgba(242,34,28,0.35)',
    backgroundColor: 'rgba(242,34,28,0.04)',
  },
  commentFeedbackCount: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '800',
  },
  commentFeedbackCountActive: {
    color: theme.colors.accentStrong,
  },
  commentAttachmentPressable: {
    alignSelf: 'flex-start',
  },
  commentImageAttachment: {
    width: 84,
    height: 84,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  commentFileAttachment: {
    minHeight: 42,
    maxWidth: 170,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentFileAttachmentText: {
    flexShrink: 1,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  actionText: {
    color: theme.colors.accentStrong,
    fontSize: 12,
    fontWeight: '800',
  },
  moreRepliesWrap: {
    marginTop: -2,
    marginBottom: 10,
  },
  moreRepliesButton: {
    alignSelf: 'flex-start',
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(242,34,28,0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moreRepliesText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  replyLoadingWrap: {
    marginBottom: 10,
  },
  skeletonList: {
    gap: 12,
  },
  skeletonCard: {
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 10,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  skeletonHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  skeletonReplyInset: {
    marginLeft: 26,
  },
});
