import React, { useMemo, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BARCODE_PATTERN } from '../constants';
import { theme, shadow } from '../theme';
import { AppEvent, AppTicket } from '../types';
import { IconButton, PrimaryButton, SecondaryButton } from './Primitives';

export function TicketScreen({
  event,
  ticket,
  onBack,
  onCancelTicket,
}: {
  event: AppEvent;
  ticket: AppTicket | null;
  onBack: () => void;
  onCancelTicket: (ticket: AppTicket) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [qrOpen, setQrOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const ticketCode = ticket?.referenceCode ?? `BNV-${event.id}`;
  const qrValue = ticket?.qrValue ?? `BNV:${ticketCode}:${event.id}`;
  const shareMessage = useMemo(
    () =>
      `${event.title}\n${event.venue} • ${event.dateLabel} • ${event.time}\nReference: ${ticketCode}\nQR: ${qrValue}`,
    [event.dateLabel, event.time, event.title, event.venue, qrValue, ticketCode],
  );

  const handleShare = async () => {
    await Share.share({
      message: shareMessage,
      title: `${event.title} ticket`,
    });
  };

  const handleSaveImage = async () => {
    const imageUrl = typeof event.ticketImage === 'string' ? event.ticketImage : typeof event.image === 'string' ? event.image : null;
    if (!imageUrl) {
      Alert.alert('Image unavailable', 'This ticket image is not ready to save yet.');
      return;
    }

    setSaving(true);

    try {
      if (Platform.OS === 'web') {
        await handleShare();
        return;
      }

      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Allow photo access so we can save ticket artwork.');
      }

      const fileUri = `${FileSystem.cacheDirectory ?? ''}ticket-${ticketCode}.jpg`;
      const downloaded = await FileSystem.downloadAsync(imageUrl, fileUri);
      await MediaLibrary.saveToLibraryAsync(downloaded.uri);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloaded.uri, {
          mimeType: 'image/jpeg',
          dialogTitle: 'Share ticket image',
        });
      }

      Alert.alert('Saved', 'The ticket image is now in your library.');
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'The ticket image could not be saved right now.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!ticket || !ticket.canCancel) {
      return;
    }

    setCancelling(true);
    try {
      await onCancelTicket(ticket);
    } catch (error) {
      Alert.alert('Cancellation failed', error instanceof Error ? error.message : 'The ticket could not be cancelled right now.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
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
          <IconButton icon="share-2" onPress={() => void handleShare()} accessibilityLabel="Share ticket" />
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
                <TicketField label="Reference" value={ticketCode} />
                <TicketField label="Status" value={ticket?.status ?? 'confirmed'} rightAligned />
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
          <PrimaryButton label={saving ? 'Saving...' : 'Save image'} icon="download" onPress={() => void handleSaveImage()} />
          <SecondaryButton label="QR code" icon="grid" onPress={() => setQrOpen(true)} />
        </View>

        {ticket?.canCancel ? (
          <View style={styles.cancelWrap}>
            <SecondaryButton
              label={cancelling ? 'Cancelling...' : 'Cancel ticket'}
              icon="x"
              onPress={() => void handleCancel()}
            />
          </View>
        ) : null}
      </ScrollView>

      <Modal animationType="slide" transparent visible={qrOpen} onRequestClose={() => setQrOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={[styles.modalCard, { marginTop: insets.top + 18, marginBottom: insets.bottom + 18 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Scan ticket</Text>
              <IconButton icon="x" onPress={() => setQrOpen(false)} accessibilityLabel="Close QR code" />
            </View>

            <View style={styles.qrCard}>
              <QRCode value={qrValue} size={208} color={theme.colors.paperInk} backgroundColor={theme.colors.paper} />
            </View>

            <Text style={styles.qrCodeLabel}>{ticketCode}</Text>
            <Text style={styles.qrHint}>Keep this screen ready for entry.</Text>
          </View>
        </View>
      </Modal>
    </>
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
      <Text numberOfLines={2} style={styles.fieldValue}>
        {value}
      </Text>
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
  cancelWrap: {
    marginTop: 12,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(8,10,14,0.82)',
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  modalCard: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#121722',
    padding: 18,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  qrCard: {
    alignSelf: 'center',
    borderRadius: 24,
    backgroundColor: theme.colors.paper,
    padding: 18,
  },
  qrCodeLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  qrHint: {
    color: theme.colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
