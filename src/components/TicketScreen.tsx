import React, { useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BARCODE_PATTERN } from '../constants';
import { theme, shadow } from '../theme';
import { AppEvent, AppTicket } from '../types';
import { showAppToast } from '../toast';
import { IconButton, PrimaryButton, SecondaryButton } from './Primitives';

export function TicketScreen({
  event,
  ticket,
  onAcceptTicket,
  onBack,
  onCancelTicket,
  onRefresh,
  refreshing,
}: {
  event: AppEvent;
  ticket: AppTicket | null;
  onAcceptTicket: (ticket: AppTicket) => Promise<void>;
  onBack: () => void;
  onCancelTicket: (ticket: AppTicket) => Promise<void>;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [qrOpen, setQrOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const ticketCaptureRef = useRef<View>(null);
  const ticketCode = ticket?.referenceCode ?? `BNV-${event.id}`;
  const qrValue = ticket?.qrValue ?? `BNV:${ticketCode}:${event.id}`;
  const requestNote = ticket?.requestNote?.trim() || 'None';
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
    setSaving(true);

    try {
      if (Platform.OS === 'web') {
        await handleShare();
        showAppToast({
          tone: 'info',
          title: 'Ticket shared',
          message: 'Use the shared ticket details as your saved copy.',
        });
        return;
      }

      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        throw new Error('Allow photo access so we can save ticket artwork.');
      }

      if (!ticketCaptureRef.current) {
        throw new Error('The ticket is still preparing. Try again in a moment.');
      }

      const capturedUri = await captureRef(ticketCaptureRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await MediaLibrary.saveToLibraryAsync(capturedUri);

      showAppToast({
        tone: 'success',
        title: 'Image saved',
        message: 'The ticket image with its QR code is in your library.',
      });
    } catch (error) {
      showAppToast({
        tone: 'error',
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'The ticket image could not be saved right now.',
      });
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
      showAppToast({
        tone: 'error',
        title: 'Cancellation failed',
        message: error instanceof Error ? error.message : 'The ticket could not be cancelled right now.',
      });
    } finally {
      setCancelling(false);
    }
  };

  const handleAccept = async () => {
    if (!ticket || !ticket.canAccept) {
      return;
    }

    setAccepting(true);
    try {
      await onAcceptTicket(ticket);
    } catch (error) {
      showAppToast({
        tone: 'error',
        title: 'Confirm failed',
        message: error instanceof Error ? error.message : 'The booking could not be confirmed right now.',
      });
    } finally {
      setAccepting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28 },
        ]}
        refreshControl={
          <RefreshControl
            colors={[theme.colors.accentStrong]}
            progressBackgroundColor={theme.colors.surfaceStrong}
            refreshing={refreshing}
            tintColor={theme.colors.accentStrong}
            onRefresh={() => void onRefresh()}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <IconButton icon="x" onPress={onBack} accessibilityLabel="Close ticket" />
          <Text style={styles.headerTitle}>Ticket</Text>
          <IconButton icon="share-2" onPress={() => void handleShare()} accessibilityLabel="Share ticket" />
        </View>

        <View ref={ticketCaptureRef} collapsable={false} style={styles.ticketShell}>
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
                <TicketField label="Access" value={formatTicketAction(ticket?.actionType)} rightAligned />
                <TicketField label="Paid" value={ticket ? `${ticket.currency} ${ticket.totalAmount}` : event.price} />
                <TicketField label="Payment" value={ticket?.paymentStatus ?? 'not_required'} rightAligned />
                <TicketField label="Quantity" value={String(ticket?.quantity ?? 1)} />
                <TicketField
                  label="Request"
                  value={requestNote}
                  rightAligned
                  onPress={requestNote !== 'None' ? () => setRequestOpen(true) : undefined}
                />
                <TicketField label="Reference" value={ticketCode} />
                <TicketField label="Status" value={formatTicketStatus(ticket?.status)} rightAligned />
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

              <View style={styles.dashedLine} />

              <View style={styles.ticketQrRow}>
                <View style={styles.ticketQrCard}>
                  <QRCode value={qrValue} size={92} color={theme.colors.paperInk} backgroundColor={theme.colors.paper} />
                </View>
                <View style={styles.ticketQrCopy}>
                  <Text style={styles.ticketQrLabel}>Scan reference</Text>
                  <Text numberOfLines={2} style={styles.ticketQrCode}>
                    {ticketCode}
                  </Text>
                  <Text numberOfLines={2} style={styles.ticketQrHint}>
                    This QR is generated from the ticket reference.
                  </Text>
                </View>
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
            {ticket.canAccept ? (
              <SecondaryButton
                label={accepting ? 'Confirming...' : 'Confirm booking'}
                icon="check"
                onPress={() => void handleAccept()}
              />
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={cancelling}
              onPress={() => void handleCancel()}
              style={styles.cancelTextAction}
            >
              <Feather color={theme.colors.accentStrong} name="x" size={14} />
              <Text style={[styles.cancelTextActionLabel, cancelling && styles.cancelTextActionLabelDisabled]}>
                {cancelling ? 'Cancelling...' : 'Cancel ticket'}
              </Text>
            </Pressable>
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

      <Modal animationType="fade" transparent visible={requestOpen} onRequestClose={() => setRequestOpen(false)}>
        <Pressable style={styles.requestModalScrim} onPress={() => setRequestOpen(false)}>
          <Pressable style={[styles.requestModalCard, { marginTop: insets.top + 24, marginBottom: insets.bottom + 24 }]}>
            <View style={styles.requestModalHeader}>
              <View>
                <Text style={styles.requestModalEyebrow}>Customer request</Text>
                <Text style={styles.requestModalTitle}>Message to host</Text>
              </View>
              <IconButton icon="x" onPress={() => setRequestOpen(false)} accessibilityLabel="Close request message" />
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.requestModalText}>{requestNote}</Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function formatTicketAction(action?: AppTicket['actionType']) {
  if (action === 'reservation') {
    return 'Reservation';
  }
  if (action === 'booking') {
    return 'Booking';
  }
  if (action === 'order') {
    return 'Order';
  }
  return 'Pass';
}

function formatTicketStatus(status?: AppTicket['status']) {
  switch (status) {
    case 'requested':
      return 'In review';
    case 'pending':
      return 'Payment pending';
    case 'confirmed':
    case 'accepted':
      return 'Accepted';
    case 'used':
      return 'Used';
    case 'cancelled':
      return 'Cancelled';
    case 'failed':
      return 'Failed';
    case 'expired':
      return 'Expired';
    default:
      return 'Accepted';
  }
}

function TicketField({
  label,
  onPress,
  value,
  rightAligned = false,
}: {
  label: string;
  onPress?: () => void;
  value: string;
  rightAligned?: boolean;
}) {
  const content = (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text numberOfLines={2} style={[styles.fieldValue, onPress && styles.fieldValuePressable]}>
        {value}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={[styles.field, rightAligned && styles.fieldRight]}>
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.field, rightAligned && styles.fieldRight]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: 4,
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
  fieldValuePressable: {
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(27,23,20,0.32)',
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
  ticketQrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  ticketQrCard: {
    borderRadius: 16,
    backgroundColor: theme.colors.paper,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(27,23,20,0.12)',
  },
  ticketQrCopy: {
    flex: 1,
    gap: 5,
  },
  ticketQrLabel: {
    color: 'rgba(27,23,20,0.42)',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  ticketQrCode: {
    color: theme.colors.paperInk,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  ticketQrHint: {
    color: 'rgba(27,23,20,0.56)',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  actions: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 12,
  },
  cancelWrap: {
    marginTop: 22,
    gap: 12,
    alignItems: 'center',
  },
  cancelTextAction: {
    minHeight: 34,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cancelTextActionLabel: {
    color: theme.colors.accentStrong,
    fontSize: 13,
    fontWeight: '900',
  },
  cancelTextActionLabelDisabled: {
    color: theme.colors.textSoft,
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
  requestModalScrim: {
    flex: 1,
    backgroundColor: 'rgba(4,7,13,0.72)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  requestModalCard: {
    maxHeight: '76%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(12,15,23,0.98)',
    padding: 16,
    gap: 14,
    ...shadow,
  },
  requestModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  requestModalEyebrow: {
    color: theme.colors.accentStrong,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  requestModalTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  requestModalText: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
});
