import { api } from './client'

export type FamilyRole = 'owner' | 'member'

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked'

export interface Family {
  id: string
  name: string
  // The requesting user's role, or null when they are the creator of an
  // unclaimed family (they can manage it until someone claims ownership).
  role: FamilyRole | null
  is_claimed: boolean
  created_at: string
}

export interface FamilyInput {
  name: string
  // When false, the family is created unclaimed (no members) so someone else
  // can be invited to claim and own it. Defaults to true (creator is owner).
  claim?: boolean
}

export interface FamilyMember {
  id: string
  user: string
  email: string
  first_name: string
  last_name: string
  role: FamilyRole
  joined_at: string
}

export interface Invitation {
  id: string
  email: string
  role: FamilyRole
  status: InvitationStatus
  token: string
  created_at: string
  expires_at: string
}

export interface InvitationInput {
  email: string
  role: FamilyRole
}

export interface InvitationPreview {
  email: string
  role: FamilyRole
  status: InvitationStatus
  family_name: string
  expires_at: string
}

// A pending invitation addressed to the current user, for their inbox.
export interface MyInvitation {
  id: string
  family_name: string
  role: FamilyRole
  token: string
  expires_at: string
}

export async function getFamilies(): Promise<Family[]> {
  const { data } = await api.get<Family[]>('/families/')
  return data
}

export async function createFamily(input: FamilyInput): Promise<Family> {
  const { data } = await api.post<Family>('/families/', input)
  return data
}

export async function updateFamily(
  id: string,
  input: { name: string },
): Promise<Family> {
  const { data } = await api.patch<Family>(`/families/${id}/`, input)
  return data
}

export async function deleteFamily(id: string): Promise<void> {
  await api.delete(`/families/${id}/`)
}

export async function leaveFamily(id: string): Promise<void> {
  await api.post(`/families/${id}/leave/`)
}

export async function getFamilyMembers(
  familyId: string,
): Promise<FamilyMember[]> {
  const { data } = await api.get<FamilyMember[]>(
    `/families/${familyId}/members/`,
  )
  return data
}

export async function removeFamilyMember(
  familyId: string,
  membershipId: string,
): Promise<void> {
  await api.delete(`/families/${familyId}/members/${membershipId}/`)
}

export async function getInvitations(familyId: string): Promise<Invitation[]> {
  const { data } = await api.get<Invitation[]>(
    `/families/${familyId}/invitations/`,
  )
  return data
}

export async function createInvitation(
  familyId: string,
  input: InvitationInput,
): Promise<Invitation> {
  const { data } = await api.post<Invitation>(
    `/families/${familyId}/invitations/`,
    input,
  )
  return data
}

export async function revokeInvitation(
  familyId: string,
  invitationId: string,
): Promise<void> {
  await api.delete(`/families/${familyId}/invitations/${invitationId}/`)
}

export async function getMyInvitations(): Promise<MyInvitation[]> {
  const { data } = await api.get<MyInvitation[]>('/invitations/')
  return data
}

export async function getInvitationPreview(
  token: string,
): Promise<InvitationPreview> {
  const { data } = await api.get<InvitationPreview>(`/invitations/${token}/`)
  return data
}

export async function acceptInvitation(token: string): Promise<Family> {
  const { data } = await api.post<Family>(`/invitations/${token}/accept/`)
  return data
}

export async function declineInvitation(token: string): Promise<void> {
  await api.post(`/invitations/${token}/decline/`)
}
