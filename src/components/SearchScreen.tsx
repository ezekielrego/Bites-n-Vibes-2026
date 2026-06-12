import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchAppFeed, fetchAppSearchSuggestions, recordSearchQuery } from '../api';
import { shadow, theme } from '../theme';
import { AppCategory, AppEvent, AppSearchSuggestion, AppUser } from '../types';
import { useJellyPressAnimation } from './Primitives';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

const QUICK_SEARCHES = ['Near me', 'Pizza', 'Restaurants', 'Tonight', 'Fast food', 'Live music'];

export function SearchScreen({
  categories,
  initialQuery = '',
  onBack,
  onOpenEvent,
  profile,
}: {
  categories: AppCategory[];
  initialQuery?: string;
  onBack: () => void;
  onOpenEvent: (event: AppEvent) => void;
  profile?: AppUser | null;
}) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<AppSearchSuggestion[]>([]);
  const [results, setResults] = useState<AppEvent[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedQuery = query.trim();
  const avatarSource = profile?.avatar ? profile.avatar : require('../../logo.png');

  const loadResults = useCallback(
    async (nextQuery: string, page = 1, mode: 'replace' | 'append' = 'replace') => {
      const cleanQuery = nextQuery.trim();
      if (!cleanQuery) {
        setResults([]);
        setNextPage(null);
        setError(null);
        return;
      }

      if (mode === 'replace') {
        setLoading(true);
      }
      setError(null);

      try {
        const response = await fetchAppFeed({
          categories,
          page,
          pageSize: 12,
          search: cleanQuery,
        });
        setResults((current) => (mode === 'append' ? mergeEvents(current, response.events) : response.events));
        setNextPage(response.nextPage);
        void recordSearchQuery({
          query: cleanQuery,
          resultCount: response.totalCount,
        }).catch(() => undefined);
      } catch {
        setError('Search could not load right now. Try again in a moment.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [categories],
  );

  useEffect(() => {
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 240);
    return () => clearTimeout(focusTimer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchAppSearchSuggestions({ query, limit: 8 })
        .then((items) => {
          if (!cancelled) {
            setSuggestions(items);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([]);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadResults(query);
    }, trimmedQuery ? 320 : 0);

    return () => clearTimeout(timer);
  }, [loadResults, query, trimmedQuery]);

  const quickSuggestions = useMemo<AppSearchSuggestion[]>(() => {
    const backendIds = new Set(suggestions.map((item) => item.query.toLowerCase()));
    const quickItems = QUICK_SEARCHES
      .filter((label) => !backendIds.has(label.toLowerCase()))
      .map((label, index) => ({
        id: `quick-${index}-${label}`,
        label,
        query: label,
        type: label === 'Near me' ? 'nearby' : 'popular',
        hint: label === 'Near me' ? 'Closest matches' : 'Popular search',
      })) satisfies AppSearchSuggestion[];

    return [...suggestions, ...quickItems].slice(0, 10);
  }, [suggestions]);

  const handleSelectSuggestion = (suggestion: AppSearchSuggestion) => {
    setQuery(suggestion.query);
    void loadResults(suggestion.query);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadResults(query);
  };

  const handleEndReached = () => {
    if (!nextPage || loading || !trimmedQuery) {
      return;
    }
    void loadResults(query, nextPage, 'append');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} onPress={onBack} style={styles.headerIconButton}>
          <Feather color={theme.colors.text} name="chevron-left" size={23} />
        </Pressable>
        <View style={styles.searchBox}>
          <Feather color={theme.colors.accentStrong} name="search" size={17} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Search bites, vibes, places..."
            placeholderTextColor={theme.colors.textSoft}
            ref={inputRef}
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void loadResults(query)}
          />
          {trimmedQuery ? (
            <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}>
              <Feather color={theme.colors.textMuted} name="x" size={17} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.avatar}>
          <Image source={avatarSource} contentFit="cover" style={styles.avatarImage} transition={100} />
        </View>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.suggestionBlock}>
            <Text style={styles.blockTitle}>{trimmedQuery ? 'Quick suggestions' : 'Start with'}</Text>
            <View style={styles.suggestionGrid}>
              {quickSuggestions.map((suggestion) => (
                <SuggestionChip
                  key={suggestion.id}
                  suggestion={suggestion}
                  onPress={() => handleSelectSuggestion(suggestion)}
                />
              ))}
            </View>
            {trimmedQuery ? <Text style={styles.resultTitle}>Results for {trimmedQuery}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {loading ? (
              <ActivityIndicator color={theme.colors.accentStrong} />
            ) : (
              <>
                <Feather color={theme.colors.textMuted} name={trimmedQuery ? 'search' : 'map-pin'} size={22} />
                <Text style={styles.emptyTitle}>{trimmedQuery ? 'No results yet' : 'Search nearby vibes'}</Text>
                <Text style={styles.emptyCopy}>
                  {trimmedQuery
                    ? 'Try a shorter phrase or choose one of the quick suggestions.'
                    : 'Backend results will appear here as soon as you type.'}
                </Text>
              </>
            )}
          </View>
        }
        ListFooterComponent={nextPage ? <ActivityIndicator color={theme.colors.accentStrong} style={styles.footerLoader} /> : null}
        refreshControl={
          <RefreshControl
            colors={[theme.colors.accentStrong]}
            progressBackgroundColor={theme.colors.surfaceStrong}
            refreshing={refreshing}
            tintColor={theme.colors.accentStrong}
            onRefresh={() => void handleRefresh()}
          />
        }
        renderItem={({ item }) => <SearchResultCard event={item} onPress={() => onOpenEvent(item)} />}
        showsVerticalScrollIndicator={false}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
      />
      {error ? <Text style={[styles.errorText, { bottom: insets.bottom + 12 }]}>{error}</Text> : null}
    </KeyboardAvoidingView>
  );
}

function SuggestionChip({
  suggestion,
  onPress,
}: {
  suggestion: AppSearchSuggestion;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.suggestionChip}>
      <Feather color={theme.colors.accentStrong} name={getSuggestionIcon(suggestion.type)} size={13} />
      <Text numberOfLines={1} style={styles.suggestionText}>{suggestion.label}</Text>
    </Pressable>
  );
}

function SearchResultCard({ event, onPress }: { event: AppEvent; onPress: () => void }) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.01,
    pressedScaleY: 0.975,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
      <AnimatedResult style={jelly.animatedStyle}>
        <Image source={event.image} contentFit="cover" style={styles.resultImage} transition={120} />
        <View style={styles.resultCopy}>
          <View style={styles.resultTopLine}>
            <Text numberOfLines={1} style={styles.resultTitleText}>{event.title}</Text>
            {event.isVerified ? (
              <View style={styles.verifiedPill}>
                <Feather color={theme.colors.accentStrong} name="check-circle" size={11} />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} style={styles.resultVenue}>{event.venue || event.city}</Text>
          <Text numberOfLines={2} style={styles.resultBlurb}>{event.blurb || event.about}</Text>
          <View style={styles.resultMetaRow}>
            <Text numberOfLines={1} style={styles.resultPrice}>{event.price}</Text>
            <View style={styles.resultMetaItem}>
              <Feather color={theme.colors.textMuted} name="map-pin" size={12} />
              <Text numberOfLines={1} style={styles.resultMetaText}>{event.city}</Text>
            </View>
            {event.ratingCount && event.ratingCount > 0 ? (
              <View style={styles.resultMetaItem}>
                <Feather color="#FFCF5A" name="star" size={12} />
                <Text style={styles.resultMetaText}>{event.rating.toFixed(1)}({event.ratingCount})</Text>
              </View>
            ) : null}
          </View>
        </View>
      </AnimatedResult>
    </Pressable>
  );
}

const AnimatedResult = ({ children, style }: { children: React.ReactNode; style: object }) => (
  <Animated.View style={[styles.resultCard, style]}>{children}</Animated.View>
);

function mergeEvents(current: AppEvent[], next: AppEvent[]) {
  const seen = new Set(current.map((event) => event.id));
  return [...current, ...next.filter((event) => !seen.has(event.id))];
}

function getSuggestionIcon(type: AppSearchSuggestion['type']): FeatherName {
  switch (type) {
    case 'nearby':
      return 'map-pin';
    case 'recent':
      return 'clock';
    case 'listing':
      return 'navigation';
    case 'category':
      return 'grid';
    case 'tag':
      return 'hash';
    default:
      return 'search';
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 14,
    paddingBottom: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(12,15,23,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  searchBox: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(8,10,14,0.28)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  headerIconButton: {
    width: 28,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 0,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  suggestionBlock: {
    gap: 10,
    marginBottom: 6,
  },
  blockTitle: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  suggestionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 18,
    rowGap: 10,
  },
  suggestionChip: {
    maxWidth: '46%',
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'transparent',
  },
  suggestionText: {
    minWidth: 0,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  resultTitle: {
    marginTop: 8,
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  resultCard: {
    minHeight: 116,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    flexDirection: 'row',
    overflow: 'hidden',
    ...shadow,
  },
  resultImage: {
    width: 104,
    minHeight: 116,
    backgroundColor: theme.colors.surfaceMuted,
  },
  resultCopy: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 11,
    paddingVertical: 10,
    gap: 5,
  },
  resultTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultTitleText: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  verifiedPill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedText: {
    color: theme.colors.accentStrong,
    fontSize: 10,
    fontWeight: '900',
  },
  resultVenue: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  resultBlurb: {
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  resultMetaRow: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultPrice: {
    maxWidth: 88,
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: '900',
  },
  resultMetaItem: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  resultMetaText: {
    minWidth: 0,
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 26,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyCopy: {
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  footerLoader: {
    paddingVertical: 18,
  },
  errorText: {
    position: 'absolute',
    left: 18,
    right: 18,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(242,34,28,0.16)',
    color: theme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
});
