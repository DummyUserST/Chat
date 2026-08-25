import { useCallback } from 'react'
import { supabase } from '../lib/supabase'

export type MFAStatus = {
  enrolled: boolean
  factorId: string | null
}

export function useMFA() {
  const getStatus = useCallback(async (): Promise<MFAStatus> => {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error || !data) return { enrolled: false, factorId: null }
    const totpList = data.totp || (data.all ? data.all.filter(f => f.factor_type === 'totp') : [])
    const totp = Array.isArray(totpList) ? totpList[0] : totpList
    return { enrolled: Boolean(totp), factorId: totp?.id || null }
  }, [])

  const enroll = useCallback(async (): Promise<{ qrCode: string | null; factorId: string | null; secret: string | null; error: string | null }> => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Tandem' })
    if (error) return { qrCode: null, factorId: null, secret: null, error: error.message }
    return { qrCode: data.totp.qr_code || null, factorId: data.id, secret: data.totp.secret || null, error: null }
  }, [])

  const verify = useCallback(async (factorId: string, code: string): Promise<{ error: string | null }> => {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError) return { error: challengeError.message }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
    if (verifyError) return { error: verifyError.message }
    return { error: null }
  }, [])

  const unenroll = useCallback(async (factorId: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    return { error: error ? error.message : null }
  }, [])

  return { getStatus, enroll, verify, unenroll }
}
