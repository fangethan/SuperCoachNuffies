import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { supabase } from '../api/supabase';
import { COLORS } from '../constants';

type Stage = 'idle' | 'sending' | 'sent';

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);

  async function sendMagicLink() {
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    setStage('sending');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    if (err) {
      setError(err.message);
      setStage('idle');
      return;
    }
    setStage('sent');
  }

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/icon.png')} style={styles.logo} />
      <Text style={styles.title}>SuperCoachNuffies</Text>
      <Text style={styles.subtitle}>
        Sign in with your email so your team follows you across devices.
      </Text>

      {stage === 'sent' ? (
        <View style={styles.sentBox}>
          <Text style={styles.sentTitle}>Check your inbox</Text>
          <Text style={styles.sentBody}>
            We sent a sign-in link to {email.trim().toLowerCase()}. Tap it on this
            phone to come back here signed in.
          </Text>
          <TouchableOpacity onPress={() => { setStage('idle'); setEmail(''); }}>
            <Text style={styles.secondaryLink}>Use a different email</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            editable={stage !== 'sending'}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.button, stage === 'sending' && styles.buttonDisabled]}
            onPress={sendMagicLink}
            disabled={stage === 'sending'}
          >
            {stage === 'sending'
              ? <ActivityIndicator color={COLORS.background} />
              : <Text style={styles.buttonText}>Email me a sign-in link</Text>}
          </TouchableOpacity>
          <Text style={styles.footnote}>
            No password to set up. We email you a one-tap sign-in link.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: COLORS.background,
    paddingHorizontal: 28, paddingTop: 100, alignItems: 'center',
  },
  logo: { width: 96, height: 96, borderRadius: 22, marginBottom: 18 },
  title: {
    fontSize: 24, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 8,
  },
  subtitle: {
    fontSize: 14, color: COLORS.textSecondary, textAlign: 'center',
    lineHeight: 20, marginBottom: 28, maxWidth: 320,
  },
  input: {
    width: '100%', backgroundColor: COLORS.surface,
    borderColor: COLORS.border, borderWidth: 1, borderRadius: 12,
    color: COLORS.textPrimary, fontSize: 16,
    paddingHorizontal: 14, paddingVertical: 14, marginBottom: 12,
  },
  button: {
    width: '100%', backgroundColor: COLORS.primary,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 18,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: COLORS.background, fontWeight: '700', fontSize: 16 },
  error: { color: COLORS.danger, fontSize: 13, marginBottom: 12, textAlign: 'center' },
  footnote: {
    fontSize: 12, color: COLORS.textMuted, textAlign: 'center', maxWidth: 280,
  },
  sentBox: {
    width: '100%', backgroundColor: COLORS.surface, borderRadius: 14,
    padding: 22, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  sentTitle: {
    fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 8,
  },
  sentBody: {
    fontSize: 13, color: COLORS.textSecondary, textAlign: 'center',
    lineHeight: 19, marginBottom: 16,
  },
  secondaryLink: {
    fontSize: 13, color: COLORS.primary, fontWeight: '600',
  },
});
