import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BARCODE_PATTERN } from '../constants';
import { theme, shadow } from '../theme';
import { AppEvent } from '../types';
import { IconButton, PrimaryButton, SecondaryButton } from './Primitives';

export function TicketScreen({
  event,
  onBack,
}: {
  event: AppEvent;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <IconButton icon="chevron-left" onPress={onBack} accessibilityLabel="Go back" />
        <Text style={styles.headerTitle}>Ticket</Text>
        <IconButton icon="share-2" accessibilityLabel="Share ticket" />
      </View>

      <View style={styles.ticketShell}>
        <View style={styles.imageWrap}>
          <Image source={event.ticketImage ?? event.image} contentFit="cover" style={styles.ticketImage} transition={220} />
        </View>

        <View style={styles.paperWrap}>
          <View style={[styles.cutout, styles.cutoutLeft]} />
          <View style={[styles.cutout, styles.cutoutRight]} />

          <View style={styles.paper}>
            <View style={styles.ticketIntro}>
              <Text style={styles.ticketTitle}>{event.artist}</Text>
              <Text style={styles.ticketSubtitle}>{event.dateLabel}</Text>
            </View>

            <View style={styles.dashedLine} />

            <View style={styles.infoGrid}>
              <TicketField label="Date" value={event.dateLabel} />
              <TicketField label="Time" value={event.time} rightAligned />
              <TicketField label="Venue" value={event.venue} />
              <TicketField label="Access" value="Floor pass" rightAligned />
            </View>

            <View style={styles.dashedLine} />

            <View style={styles.barcodeWrap}>
              {BARCODE_PATTERN.map((height, index) => (
                <View
                  key={`${height}-${index}`}
                  style={[
                    styles.barcodeBar,
                    {
                      height: `${height}%`,
                      width: index % 5 === 0 ? 3 : 2,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="Save image" icon="download" />
        <SecondaryButton label="QR code" icon="grid" />
      </View>
    </ScrollView>
  );
}

function TicketField({
  label,
  value,
  rightAligned = false,
}: {
  label: string;
  value: string;
  rightAligned?: boolean;
}) {
  return (
    <View style={[styles.field, rightAligned && styles.fieldRight]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  ticketShell: {
    borderRadius: 34,
    padding: 14,
    backgroundColor: 'rgba(38,22,19,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    ...shadow,
  },
  imageWrap: {
    borderRadius: 26,
    overflow: 'hidden',
    marginBottom: 12,
  },
  ticketImage: {
    width: '100%',
    aspectRatio: 1.3,
  },
  paperWrap: {
    position: 'relative',
  },
  paper: {
    borderRadius: 24,
    backgroundColor: theme.colors.paper,
    paddingHorizontal: 22,
    paddingVertical: 20,
  },
  cutout: {
    position: 'absolute',
    top: '50%',
    width: 24,
    height: 24,
    marginTop: -12,
    borderRadius: 999,
    backgroundColor: 'rgba(38,22,19,0.85)',
    zIndex: 2,
  },
  cutoutLeft: {
    left: -12,
  },
  cutoutRight: {
    right: -12,
  },
  ticketIntro: {
    alignItems: 'center',
    gap: 6,
  },
  ticketTitle: {
    color: theme.colors.paperInk,
    fontSize: 23,
    fontWeight: '800',
    textAlign: 'center',
  },
  ticketSubtitle: {
    color: 'rgba(27,23,20,0.58)',
    fontSize: 13,
    fontWeight: '700',
  },
  dashedLine: {
    marginVertical: 18,
    borderTopWidth: 1,
    borderColor: 'rgba(27,23,20,0.16)',
    borderStyle: 'dashed',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
  },
  field: {
    width: '50%',
    gap: 6,
  },
  fieldRight: {
    alignItems: 'flex-end',
  },
  fieldLabel: {
    color: 'rgba(27,23,20,0.42)',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  fieldValue: {
    color: theme.colors.paperInk,
    fontSize: 14,
    fontWeight: '700',
  },
  barcodeWrap: {
    height: 74,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 2,
  },
  barcodeBar: {
    backgroundColor: theme.colors.paperInk,
    borderRadius: 2,
  },
  actions: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 12,
  },
});
