import React from 'react'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    setLoading(true)
    // Check all role tables
    let { data } = await supabase.from('clinics').select('*').eq('user_id', userId).maybeSingle()
    if (data) { setProfile({ ...data, role: 'clinic' }); setLoading(false); return }
    ;({ data } = await supabase.from('clinicians').select('*').eq('user_id', userId).maybeSingle())
    if (data) { setProfile({ ...data, role: 'clinician' }); setLoading(false); return }
    ;({ data } = await supabase.from('patients').select('*').eq('user_id', userId).maybeSingle())
    if (data) { setProfile({ ...data, role: 'patient' }); setLoading(false); return }
    setProfile(null); setLoading(false)
  }

  async function signUp({ email, password, role, extraData }) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    const userId = data.user.id
    if (role === 'clinic') {
      const clinicId = 'CL-' + Math.floor(1000 + Math.random() * 8999)
      const { error: e } = await supabase.from('clinics').insert({ user_id: userId, clinic_id: clinicId, ...extraData })
      if (e) throw e
    } else if (role === 'clinician') {
      const clinicianId = 'DR-' + Math.floor(1000 + Math.random() * 8999)
      const { error: e } = await supabase.from('clinicians').insert({ user_id: userId, clinician_id: clinicianId, ...extraData })
      if (e) throw e
    } else if (role === 'patient') {
      const patientId = 'PT-' + Math.floor(1000 + Math.random() * 8999)
      const { error: e } = await supabase.from('patients').insert({ user_id: userId, patient_id: patientId, ...extraData })
      if (e) throw e
    }
    return data
  }

  async function signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signUp, signIn, signOut, fetchProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
