import { emptyApi as api } from "./emptyApi";
export const addTagTypes = [
  "auth",
  "contract-invitations",
  "families",
  "health",
  "holidays",
  "invitations",
  "minimum-wage",
  "paid-leave-default",
] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      authJwtBlacklistCreate: build.mutation<
        AuthJwtBlacklistCreateApiResponse,
        AuthJwtBlacklistCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/jwt/blacklist/`,
          method: "POST",
          body: queryArg.tokenBlacklistRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      authJwtCreateCreate: build.mutation<
        AuthJwtCreateCreateApiResponse,
        AuthJwtCreateCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/jwt/create/`,
          method: "POST",
          body: queryArg.tokenObtainPairRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      authJwtRefreshCreate: build.mutation<
        AuthJwtRefreshCreateApiResponse,
        AuthJwtRefreshCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/jwt/refresh/`,
          method: "POST",
          body: queryArg.tokenRefreshRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      authJwtVerifyCreate: build.mutation<
        AuthJwtVerifyCreateApiResponse,
        AuthJwtVerifyCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/jwt/verify/`,
          method: "POST",
          body: queryArg.tokenVerifyRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      authUsersList: build.query<AuthUsersListApiResponse, AuthUsersListApiArg>(
        {
          query: () => ({ url: `/auth/users/` }),
          providesTags: ["auth"],
        },
      ),
      authUsersCreate: build.mutation<
        AuthUsersCreateApiResponse,
        AuthUsersCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/users/`,
          method: "POST",
          body: queryArg.registerRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      authUsersRetrieve: build.query<
        AuthUsersRetrieveApiResponse,
        AuthUsersRetrieveApiArg
      >({
        query: (queryArg) => ({ url: `/auth/users/${queryArg.id}/` }),
        providesTags: ["auth"],
      }),
      authUsersUpdate: build.mutation<
        AuthUsersUpdateApiResponse,
        AuthUsersUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/users/${queryArg.id}/`,
          method: "PUT",
          body: queryArg.profileRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      authUsersPartialUpdate: build.mutation<
        AuthUsersPartialUpdateApiResponse,
        AuthUsersPartialUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/users/${queryArg.id}/`,
          method: "PATCH",
          body: queryArg.patchedProfileRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      authUsersDestroy: build.mutation<
        AuthUsersDestroyApiResponse,
        AuthUsersDestroyApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/users/${queryArg.id}/`,
          method: "DELETE",
        }),
        invalidatesTags: ["auth"],
      }),
      authUsersActivationCreate: build.mutation<
        AuthUsersActivationCreateApiResponse,
        AuthUsersActivationCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/users/activation/`,
          method: "POST",
          body: queryArg.activationRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      authUsersMeRetrieve: build.query<
        AuthUsersMeRetrieveApiResponse,
        AuthUsersMeRetrieveApiArg
      >({
        query: () => ({ url: `/auth/users/me/` }),
        providesTags: ["auth"],
      }),
      authUsersMeUpdate: build.mutation<
        AuthUsersMeUpdateApiResponse,
        AuthUsersMeUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/users/me/`,
          method: "PUT",
          body: queryArg.profileRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      authUsersMePartialUpdate: build.mutation<
        AuthUsersMePartialUpdateApiResponse,
        AuthUsersMePartialUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/users/me/`,
          method: "PATCH",
          body: queryArg.patchedProfileRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      authUsersMeDestroy: build.mutation<
        AuthUsersMeDestroyApiResponse,
        AuthUsersMeDestroyApiArg
      >({
        query: () => ({ url: `/auth/users/me/`, method: "DELETE" }),
        invalidatesTags: ["auth"],
      }),
      authUsersResendActivationCreate: build.mutation<
        AuthUsersResendActivationCreateApiResponse,
        AuthUsersResendActivationCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/users/resend_activation/`,
          method: "POST",
          body: queryArg.sendEmailResetRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      authUsersResetEmailCreate: build.mutation<
        AuthUsersResetEmailCreateApiResponse,
        AuthUsersResetEmailCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/users/reset_email/`,
          method: "POST",
          body: queryArg.sendEmailResetRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      authUsersResetEmailConfirmCreate: build.mutation<
        AuthUsersResetEmailConfirmCreateApiResponse,
        AuthUsersResetEmailConfirmCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/users/reset_email_confirm/`,
          method: "POST",
          body: queryArg.usernameResetConfirmRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      authUsersResetPasswordCreate: build.mutation<
        AuthUsersResetPasswordCreateApiResponse,
        AuthUsersResetPasswordCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/users/reset_password/`,
          method: "POST",
          body: queryArg.sendEmailResetRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      authUsersResetPasswordConfirmCreate: build.mutation<
        AuthUsersResetPasswordConfirmCreateApiResponse,
        AuthUsersResetPasswordConfirmCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/users/reset_password_confirm/`,
          method: "POST",
          body: queryArg.passwordResetConfirmRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      authUsersSetEmailCreate: build.mutation<
        AuthUsersSetEmailCreateApiResponse,
        AuthUsersSetEmailCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/users/set_email/`,
          method: "POST",
          body: queryArg.setEmailRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      authUsersSetPasswordCreate: build.mutation<
        AuthUsersSetPasswordCreateApiResponse,
        AuthUsersSetPasswordCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/auth/users/set_password/`,
          method: "POST",
          body: queryArg.setPasswordRequest,
        }),
        invalidatesTags: ["auth"],
      }),
      contractInvitationsList: build.query<
        ContractInvitationsListApiResponse,
        ContractInvitationsListApiArg
      >({
        query: () => ({ url: `/contract-invitations/` }),
        providesTags: ["contract-invitations"],
      }),
      contractInvitationsRetrieve: build.query<
        ContractInvitationsRetrieveApiResponse,
        ContractInvitationsRetrieveApiArg
      >({
        query: (queryArg) => ({
          url: `/contract-invitations/${queryArg.token}/`,
        }),
        providesTags: ["contract-invitations"],
      }),
      contractInvitationsAcceptCreate: build.mutation<
        ContractInvitationsAcceptCreateApiResponse,
        ContractInvitationsAcceptCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/contract-invitations/${queryArg.token}/accept/`,
          method: "POST",
          body: queryArg.acceptContractInvitationRequestRequest,
        }),
        invalidatesTags: ["contract-invitations"],
      }),
      contractInvitationsDeclineCreate: build.mutation<
        ContractInvitationsDeclineCreateApiResponse,
        ContractInvitationsDeclineCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/contract-invitations/${queryArg.token}/decline/`,
          method: "POST",
        }),
        invalidatesTags: ["contract-invitations"],
      }),
      familiesList: build.query<FamiliesListApiResponse, FamiliesListApiArg>({
        query: () => ({ url: `/families/` }),
        providesTags: ["families"],
      }),
      familiesCreate: build.mutation<
        FamiliesCreateApiResponse,
        FamiliesCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/`,
          method: "POST",
          body: queryArg.familyRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesChildrenList: build.query<
        FamiliesChildrenListApiResponse,
        FamiliesChildrenListApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/children/`,
        }),
        providesTags: ["families"],
      }),
      familiesChildrenCreate: build.mutation<
        FamiliesChildrenCreateApiResponse,
        FamiliesChildrenCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/children/`,
          method: "POST",
          body: queryArg.childRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesChildrenRetrieve: build.query<
        FamiliesChildrenRetrieveApiResponse,
        FamiliesChildrenRetrieveApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/children/${queryArg.id}/`,
        }),
        providesTags: ["families"],
      }),
      familiesChildrenUpdate: build.mutation<
        FamiliesChildrenUpdateApiResponse,
        FamiliesChildrenUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/children/${queryArg.id}/`,
          method: "PUT",
          body: queryArg.childRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesChildrenPartialUpdate: build.mutation<
        FamiliesChildrenPartialUpdateApiResponse,
        FamiliesChildrenPartialUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/children/${queryArg.id}/`,
          method: "PATCH",
          body: queryArg.patchedChildRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesChildrenDestroy: build.mutation<
        FamiliesChildrenDestroyApiResponse,
        FamiliesChildrenDestroyApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/children/${queryArg.id}/`,
          method: "DELETE",
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsList: build.query<
        FamiliesContractsListApiResponse,
        FamiliesContractsListApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/`,
        }),
        providesTags: ["families"],
      }),
      familiesContractsCreate: build.mutation<
        FamiliesContractsCreateApiResponse,
        FamiliesContractsCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/`,
          method: "POST",
          body: queryArg.contractRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsChildrenList: build.query<
        FamiliesContractsChildrenListApiResponse,
        FamiliesContractsChildrenListApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/children/`,
        }),
        providesTags: ["families"],
      }),
      familiesContractsChildrenCreate: build.mutation<
        FamiliesContractsChildrenCreateApiResponse,
        FamiliesContractsChildrenCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/children/`,
          method: "POST",
          body: queryArg.contractChildRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsChildrenRetrieve: build.query<
        FamiliesContractsChildrenRetrieveApiResponse,
        FamiliesContractsChildrenRetrieveApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/children/${queryArg.id}/`,
        }),
        providesTags: ["families"],
      }),
      familiesContractsChildrenUpdate: build.mutation<
        FamiliesContractsChildrenUpdateApiResponse,
        FamiliesContractsChildrenUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/children/${queryArg.id}/`,
          method: "PUT",
          body: queryArg.contractChildRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsChildrenPartialUpdate: build.mutation<
        FamiliesContractsChildrenPartialUpdateApiResponse,
        FamiliesContractsChildrenPartialUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/children/${queryArg.id}/`,
          method: "PATCH",
          body: queryArg.patchedContractChildRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsChildrenDestroy: build.mutation<
        FamiliesContractsChildrenDestroyApiResponse,
        FamiliesContractsChildrenDestroyApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/children/${queryArg.id}/`,
          method: "DELETE",
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsDeclarationsList: build.query<
        FamiliesContractsDeclarationsListApiResponse,
        FamiliesContractsDeclarationsListApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/declarations/`,
          params: {
            month: queryArg.month,
          },
        }),
        providesTags: ["families"],
      }),
      familiesContractsDeclarationsRetrieve: build.query<
        FamiliesContractsDeclarationsRetrieveApiResponse,
        FamiliesContractsDeclarationsRetrieveApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/declarations/${queryArg.id}/`,
        }),
        providesTags: ["families"],
      }),
      familiesContractsDeclarationsPartialUpdate: build.mutation<
        FamiliesContractsDeclarationsPartialUpdateApiResponse,
        FamiliesContractsDeclarationsPartialUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/declarations/${queryArg.id}/`,
          method: "PATCH",
          body: queryArg.patchedMonthlyDeclarationRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsDeclarationsFileCreate: build.mutation<
        FamiliesContractsDeclarationsFileCreateApiResponse,
        FamiliesContractsDeclarationsFileCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/declarations/${queryArg.id}/file/`,
          method: "POST",
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsExceptionalHoursList: build.query<
        FamiliesContractsExceptionalHoursListApiResponse,
        FamiliesContractsExceptionalHoursListApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/exceptional-hours/`,
        }),
        providesTags: ["families"],
      }),
      familiesContractsExceptionalHoursCreate: build.mutation<
        FamiliesContractsExceptionalHoursCreateApiResponse,
        FamiliesContractsExceptionalHoursCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/exceptional-hours/`,
          method: "POST",
          body: queryArg.exceptionalHoursRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsExceptionalHoursRetrieve: build.query<
        FamiliesContractsExceptionalHoursRetrieveApiResponse,
        FamiliesContractsExceptionalHoursRetrieveApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/exceptional-hours/${queryArg.id}/`,
        }),
        providesTags: ["families"],
      }),
      familiesContractsExceptionalHoursUpdate: build.mutation<
        FamiliesContractsExceptionalHoursUpdateApiResponse,
        FamiliesContractsExceptionalHoursUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/exceptional-hours/${queryArg.id}/`,
          method: "PUT",
          body: queryArg.exceptionalHoursRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsExceptionalHoursPartialUpdate: build.mutation<
        FamiliesContractsExceptionalHoursPartialUpdateApiResponse,
        FamiliesContractsExceptionalHoursPartialUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/exceptional-hours/${queryArg.id}/`,
          method: "PATCH",
          body: queryArg.patchedExceptionalHoursRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsExceptionalHoursDestroy: build.mutation<
        FamiliesContractsExceptionalHoursDestroyApiResponse,
        FamiliesContractsExceptionalHoursDestroyApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/exceptional-hours/${queryArg.id}/`,
          method: "DELETE",
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsExceptionalPresencesList: build.query<
        FamiliesContractsExceptionalPresencesListApiResponse,
        FamiliesContractsExceptionalPresencesListApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/exceptional-presences/`,
        }),
        providesTags: ["families"],
      }),
      familiesContractsExceptionalPresencesCreate: build.mutation<
        FamiliesContractsExceptionalPresencesCreateApiResponse,
        FamiliesContractsExceptionalPresencesCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/exceptional-presences/`,
          method: "POST",
          body: queryArg.exceptionalPresenceRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsExceptionalPresencesRetrieve: build.query<
        FamiliesContractsExceptionalPresencesRetrieveApiResponse,
        FamiliesContractsExceptionalPresencesRetrieveApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/exceptional-presences/${queryArg.id}/`,
        }),
        providesTags: ["families"],
      }),
      familiesContractsExceptionalPresencesUpdate: build.mutation<
        FamiliesContractsExceptionalPresencesUpdateApiResponse,
        FamiliesContractsExceptionalPresencesUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/exceptional-presences/${queryArg.id}/`,
          method: "PUT",
          body: queryArg.exceptionalPresenceRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsExceptionalPresencesPartialUpdate: build.mutation<
        FamiliesContractsExceptionalPresencesPartialUpdateApiResponse,
        FamiliesContractsExceptionalPresencesPartialUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/exceptional-presences/${queryArg.id}/`,
          method: "PATCH",
          body: queryArg.patchedExceptionalPresenceRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsExceptionalPresencesDestroy: build.mutation<
        FamiliesContractsExceptionalPresencesDestroyApiResponse,
        FamiliesContractsExceptionalPresencesDestroyApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/exceptional-presences/${queryArg.id}/`,
          method: "DELETE",
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsInvitationsList: build.query<
        FamiliesContractsInvitationsListApiResponse,
        FamiliesContractsInvitationsListApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/invitations/`,
        }),
        providesTags: ["families"],
      }),
      familiesContractsInvitationsCreate: build.mutation<
        FamiliesContractsInvitationsCreateApiResponse,
        FamiliesContractsInvitationsCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/invitations/`,
          method: "POST",
          body: queryArg.contractInvitationRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsInvitationsDestroy: build.mutation<
        FamiliesContractsInvitationsDestroyApiResponse,
        FamiliesContractsInvitationsDestroyApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/invitations/${queryArg.id}/`,
          method: "DELETE",
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsLeavesList: build.query<
        FamiliesContractsLeavesListApiResponse,
        FamiliesContractsLeavesListApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/leaves/`,
        }),
        providesTags: ["families"],
      }),
      familiesContractsLeavesCreate: build.mutation<
        FamiliesContractsLeavesCreateApiResponse,
        FamiliesContractsLeavesCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/leaves/`,
          method: "POST",
          body: queryArg.leaveRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsLeavesRetrieve: build.query<
        FamiliesContractsLeavesRetrieveApiResponse,
        FamiliesContractsLeavesRetrieveApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/leaves/${queryArg.id}/`,
        }),
        providesTags: ["families"],
      }),
      familiesContractsLeavesUpdate: build.mutation<
        FamiliesContractsLeavesUpdateApiResponse,
        FamiliesContractsLeavesUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/leaves/${queryArg.id}/`,
          method: "PUT",
          body: queryArg.leaveRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsLeavesPartialUpdate: build.mutation<
        FamiliesContractsLeavesPartialUpdateApiResponse,
        FamiliesContractsLeavesPartialUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/leaves/${queryArg.id}/`,
          method: "PATCH",
          body: queryArg.patchedLeaveRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsLeavesDestroy: build.mutation<
        FamiliesContractsLeavesDestroyApiResponse,
        FamiliesContractsLeavesDestroyApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/leaves/${queryArg.id}/`,
          method: "DELETE",
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsScheduleList: build.query<
        FamiliesContractsScheduleListApiResponse,
        FamiliesContractsScheduleListApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/schedule/`,
        }),
        providesTags: ["families"],
      }),
      familiesContractsScheduleCreate: build.mutation<
        FamiliesContractsScheduleCreateApiResponse,
        FamiliesContractsScheduleCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/schedule/`,
          method: "POST",
          body: queryArg.contractScheduleRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsScheduleRetrieve: build.query<
        FamiliesContractsScheduleRetrieveApiResponse,
        FamiliesContractsScheduleRetrieveApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/schedule/${queryArg.id}/`,
        }),
        providesTags: ["families"],
      }),
      familiesContractsScheduleUpdate: build.mutation<
        FamiliesContractsScheduleUpdateApiResponse,
        FamiliesContractsScheduleUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/schedule/${queryArg.id}/`,
          method: "PUT",
          body: queryArg.contractScheduleRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsSchedulePartialUpdate: build.mutation<
        FamiliesContractsSchedulePartialUpdateApiResponse,
        FamiliesContractsSchedulePartialUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/schedule/${queryArg.id}/`,
          method: "PATCH",
          body: queryArg.patchedContractScheduleRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsScheduleDestroy: build.mutation<
        FamiliesContractsScheduleDestroyApiResponse,
        FamiliesContractsScheduleDestroyApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/schedule/${queryArg.id}/`,
          method: "DELETE",
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsTermsList: build.query<
        FamiliesContractsTermsListApiResponse,
        FamiliesContractsTermsListApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/terms/`,
        }),
        providesTags: ["families"],
      }),
      familiesContractsTermsCreate: build.mutation<
        FamiliesContractsTermsCreateApiResponse,
        FamiliesContractsTermsCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/terms/`,
          method: "POST",
          body: queryArg.contractTermsRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsTermsRetrieve: build.query<
        FamiliesContractsTermsRetrieveApiResponse,
        FamiliesContractsTermsRetrieveApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/terms/${queryArg.id}/`,
        }),
        providesTags: ["families"],
      }),
      familiesContractsTermsUpdate: build.mutation<
        FamiliesContractsTermsUpdateApiResponse,
        FamiliesContractsTermsUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/terms/${queryArg.id}/`,
          method: "PUT",
          body: queryArg.contractTermsRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsTermsPartialUpdate: build.mutation<
        FamiliesContractsTermsPartialUpdateApiResponse,
        FamiliesContractsTermsPartialUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/terms/${queryArg.id}/`,
          method: "PATCH",
          body: queryArg.patchedContractTermsRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsTermsDestroy: build.mutation<
        FamiliesContractsTermsDestroyApiResponse,
        FamiliesContractsTermsDestroyApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.contractPk}/terms/${queryArg.id}/`,
          method: "DELETE",
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsRetrieve: build.query<
        FamiliesContractsRetrieveApiResponse,
        FamiliesContractsRetrieveApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.id}/`,
        }),
        providesTags: ["families"],
      }),
      familiesContractsUpdate: build.mutation<
        FamiliesContractsUpdateApiResponse,
        FamiliesContractsUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.id}/`,
          method: "PUT",
          body: queryArg.contractRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsPartialUpdate: build.mutation<
        FamiliesContractsPartialUpdateApiResponse,
        FamiliesContractsPartialUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.id}/`,
          method: "PATCH",
          body: queryArg.patchedContractRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsDestroy: build.mutation<
        FamiliesContractsDestroyApiResponse,
        FamiliesContractsDestroyApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.id}/`,
          method: "DELETE",
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsAttachFamilyCreate: build.mutation<
        FamiliesContractsAttachFamilyCreateApiResponse,
        FamiliesContractsAttachFamilyCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.id}/attach-family/`,
          method: "POST",
          body: queryArg.attachFamilyRequestRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesContractsPaidLeaveRetrieve: build.query<
        FamiliesContractsPaidLeaveRetrieveApiResponse,
        FamiliesContractsPaidLeaveRetrieveApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/contracts/${queryArg.id}/paid-leave/`,
        }),
        providesTags: ["families"],
      }),
      familiesDashboardRetrieve: build.query<
        FamiliesDashboardRetrieveApiResponse,
        FamiliesDashboardRetrieveApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/dashboard/`,
          params: {
            months: queryArg.months,
          },
        }),
        providesTags: ["families"],
      }),
      familiesInvitationsList: build.query<
        FamiliesInvitationsListApiResponse,
        FamiliesInvitationsListApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/invitations/`,
        }),
        providesTags: ["families"],
      }),
      familiesInvitationsCreate: build.mutation<
        FamiliesInvitationsCreateApiResponse,
        FamiliesInvitationsCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/invitations/`,
          method: "POST",
          body: queryArg.invitationRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesInvitationsDestroy: build.mutation<
        FamiliesInvitationsDestroyApiResponse,
        FamiliesInvitationsDestroyApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/invitations/${queryArg.id}/`,
          method: "DELETE",
        }),
        invalidatesTags: ["families"],
      }),
      familiesMembersList: build.query<
        FamiliesMembersListApiResponse,
        FamiliesMembersListApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/members/`,
        }),
        providesTags: ["families"],
      }),
      familiesMembersDestroy: build.mutation<
        FamiliesMembersDestroyApiResponse,
        FamiliesMembersDestroyApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/members/${queryArg.id}/`,
          method: "DELETE",
        }),
        invalidatesTags: ["families"],
      }),
      familiesPlanningRetrieve: build.query<
        FamiliesPlanningRetrieveApiResponse,
        FamiliesPlanningRetrieveApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/planning/`,
          params: {
            month: queryArg.month,
          },
        }),
        providesTags: ["families"],
      }),
      familiesSimulationRetrieve: build.query<
        FamiliesSimulationRetrieveApiResponse,
        FamiliesSimulationRetrieveApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.familyPk}/simulation/`,
          params: {
            from: queryArg["from"],
            to: queryArg.to,
          },
        }),
        providesTags: ["families"],
      }),
      familiesRetrieve: build.query<
        FamiliesRetrieveApiResponse,
        FamiliesRetrieveApiArg
      >({
        query: (queryArg) => ({ url: `/families/${queryArg.id}/` }),
        providesTags: ["families"],
      }),
      familiesUpdate: build.mutation<
        FamiliesUpdateApiResponse,
        FamiliesUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.id}/`,
          method: "PUT",
          body: queryArg.familyRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesPartialUpdate: build.mutation<
        FamiliesPartialUpdateApiResponse,
        FamiliesPartialUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.id}/`,
          method: "PATCH",
          body: queryArg.patchedFamilyRequest,
        }),
        invalidatesTags: ["families"],
      }),
      familiesDestroy: build.mutation<
        FamiliesDestroyApiResponse,
        FamiliesDestroyApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.id}/`,
          method: "DELETE",
        }),
        invalidatesTags: ["families"],
      }),
      familiesLeaveCreate: build.mutation<
        FamiliesLeaveCreateApiResponse,
        FamiliesLeaveCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/families/${queryArg.id}/leave/`,
          method: "POST",
        }),
        invalidatesTags: ["families"],
      }),
      healthRetrieve: build.query<
        HealthRetrieveApiResponse,
        HealthRetrieveApiArg
      >({
        query: () => ({ url: `/health/` }),
        providesTags: ["health"],
      }),
      holidaysList: build.query<HolidaysListApiResponse, HolidaysListApiArg>({
        query: (queryArg) => ({
          url: `/holidays/`,
          params: {
            year: queryArg.year,
          },
        }),
        providesTags: ["holidays"],
      }),
      invitationsList: build.query<
        InvitationsListApiResponse,
        InvitationsListApiArg
      >({
        query: () => ({ url: `/invitations/` }),
        providesTags: ["invitations"],
      }),
      invitationsRetrieve: build.query<
        InvitationsRetrieveApiResponse,
        InvitationsRetrieveApiArg
      >({
        query: (queryArg) => ({ url: `/invitations/${queryArg.token}/` }),
        providesTags: ["invitations"],
      }),
      invitationsAcceptCreate: build.mutation<
        InvitationsAcceptCreateApiResponse,
        InvitationsAcceptCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/invitations/${queryArg.token}/accept/`,
          method: "POST",
        }),
        invalidatesTags: ["invitations"],
      }),
      invitationsDeclineCreate: build.mutation<
        InvitationsDeclineCreateApiResponse,
        InvitationsDeclineCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/invitations/${queryArg.token}/decline/`,
          method: "POST",
        }),
        invalidatesTags: ["invitations"],
      }),
      minimumWageRetrieve: build.query<
        MinimumWageRetrieveApiResponse,
        MinimumWageRetrieveApiArg
      >({
        query: (queryArg) => ({
          url: `/minimum-wage/`,
          params: {
            on: queryArg.on,
          },
        }),
        providesTags: ["minimum-wage"],
      }),
      paidLeaveDefaultRetrieve: build.query<
        PaidLeaveDefaultRetrieveApiResponse,
        PaidLeaveDefaultRetrieveApiArg
      >({
        query: (queryArg) => ({
          url: `/paid-leave-default/`,
          params: {
            on: queryArg.on,
          },
        }),
        providesTags: ["paid-leave-default"],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as generatedApi };
export type AuthJwtBlacklistCreateApiResponse = unknown;
export type AuthJwtBlacklistCreateApiArg = {
  tokenBlacklistRequest: TokenBlacklistRequestWrite;
};
export type AuthJwtCreateCreateApiResponse =
  /** status 200  */ TokenObtainPairRead;
export type AuthJwtCreateCreateApiArg = {
  tokenObtainPairRequest: TokenObtainPairRequestWrite;
};
export type AuthJwtRefreshCreateApiResponse =
  /** status 200  */ TokenRefreshRead;
export type AuthJwtRefreshCreateApiArg = {
  tokenRefreshRequest: TokenRefreshRequestWrite;
};
export type AuthJwtVerifyCreateApiResponse = unknown;
export type AuthJwtVerifyCreateApiArg = {
  tokenVerifyRequest: TokenVerifyRequestWrite;
};
export type AuthUsersListApiResponse = /** status 200  */ ProfileRead[];
export type AuthUsersListApiArg = void;
export type AuthUsersCreateApiResponse = /** status 201  */ RegisterRead;
export type AuthUsersCreateApiArg = {
  registerRequest: RegisterRequestWrite;
};
export type AuthUsersRetrieveApiResponse = /** status 200  */ ProfileRead;
export type AuthUsersRetrieveApiArg = {
  /** A UUID string identifying this user. */
  id: string;
};
export type AuthUsersUpdateApiResponse = /** status 200  */ ProfileRead;
export type AuthUsersUpdateApiArg = {
  /** A UUID string identifying this user. */
  id: string;
  profileRequest: ProfileRequest;
};
export type AuthUsersPartialUpdateApiResponse = /** status 200  */ ProfileRead;
export type AuthUsersPartialUpdateApiArg = {
  /** A UUID string identifying this user. */
  id: string;
  patchedProfileRequest: PatchedProfileRequest;
};
export type AuthUsersDestroyApiResponse = unknown;
export type AuthUsersDestroyApiArg = {
  /** A UUID string identifying this user. */
  id: string;
};
export type AuthUsersActivationCreateApiResponse =
  /** status 200  */ Activation;
export type AuthUsersActivationCreateApiArg = {
  activationRequest: ActivationRequest;
};
export type AuthUsersMeRetrieveApiResponse = /** status 200  */ ProfileRead;
export type AuthUsersMeRetrieveApiArg = void;
export type AuthUsersMeUpdateApiResponse = /** status 200  */ ProfileRead;
export type AuthUsersMeUpdateApiArg = {
  profileRequest: ProfileRequest;
};
export type AuthUsersMePartialUpdateApiResponse =
  /** status 200  */ ProfileRead;
export type AuthUsersMePartialUpdateApiArg = {
  patchedProfileRequest: PatchedProfileRequest;
};
export type AuthUsersMeDestroyApiResponse = unknown;
export type AuthUsersMeDestroyApiArg = void;
export type AuthUsersResendActivationCreateApiResponse =
  /** status 200  */ SendEmailReset;
export type AuthUsersResendActivationCreateApiArg = {
  sendEmailResetRequest: SendEmailResetRequest;
};
export type AuthUsersResetEmailCreateApiResponse =
  /** status 200  */ SendEmailReset;
export type AuthUsersResetEmailCreateApiArg = {
  sendEmailResetRequest: SendEmailResetRequest;
};
export type AuthUsersResetEmailConfirmCreateApiResponse =
  /** status 200  */ UsernameResetConfirm;
export type AuthUsersResetEmailConfirmCreateApiArg = {
  usernameResetConfirmRequest: UsernameResetConfirmRequest;
};
export type AuthUsersResetPasswordCreateApiResponse =
  /** status 200  */ SendEmailReset;
export type AuthUsersResetPasswordCreateApiArg = {
  sendEmailResetRequest: SendEmailResetRequest;
};
export type AuthUsersResetPasswordConfirmCreateApiResponse =
  /** status 200  */ PasswordResetConfirm;
export type AuthUsersResetPasswordConfirmCreateApiArg = {
  passwordResetConfirmRequest: PasswordResetConfirmRequest;
};
export type AuthUsersSetEmailCreateApiResponse = /** status 200  */ SetEmail;
export type AuthUsersSetEmailCreateApiArg = {
  setEmailRequest: SetEmailRequest;
};
export type AuthUsersSetPasswordCreateApiResponse =
  /** status 200  */ SetPassword;
export type AuthUsersSetPasswordCreateApiArg = {
  setPasswordRequest: SetPasswordRequest;
};
export type ContractInvitationsListApiResponse =
  /** status 200  */ MyContractInvitationRead[];
export type ContractInvitationsListApiArg = void;
export type ContractInvitationsRetrieveApiResponse =
  /** status 200  */ ContractInvitationPreviewRead;
export type ContractInvitationsRetrieveApiArg = {
  token: string;
};
export type ContractInvitationsAcceptCreateApiResponse =
  /** status 200  */ ContractRead;
export type ContractInvitationsAcceptCreateApiArg = {
  token: string;
  acceptContractInvitationRequestRequest: AcceptContractInvitationRequestRequest;
};
export type ContractInvitationsDeclineCreateApiResponse = unknown;
export type ContractInvitationsDeclineCreateApiArg = {
  token: string;
};
export type FamiliesListApiResponse = /** status 200  */ FamilyRead[];
export type FamiliesListApiArg = void;
export type FamiliesCreateApiResponse = /** status 201  */ FamilyRead;
export type FamiliesCreateApiArg = {
  familyRequest: FamilyRequestWrite;
};
export type FamiliesChildrenListApiResponse = /** status 200  */ ChildRead[];
export type FamiliesChildrenListApiArg = {
  familyPk: string;
};
export type FamiliesChildrenCreateApiResponse = /** status 201  */ ChildRead;
export type FamiliesChildrenCreateApiArg = {
  familyPk: string;
  childRequest: ChildRequest;
};
export type FamiliesChildrenRetrieveApiResponse = /** status 200  */ ChildRead;
export type FamiliesChildrenRetrieveApiArg = {
  familyPk: string;
  id: string;
};
export type FamiliesChildrenUpdateApiResponse = /** status 200  */ ChildRead;
export type FamiliesChildrenUpdateApiArg = {
  familyPk: string;
  id: string;
  childRequest: ChildRequest;
};
export type FamiliesChildrenPartialUpdateApiResponse =
  /** status 200  */ ChildRead;
export type FamiliesChildrenPartialUpdateApiArg = {
  familyPk: string;
  id: string;
  patchedChildRequest: PatchedChildRequest;
};
export type FamiliesChildrenDestroyApiResponse = unknown;
export type FamiliesChildrenDestroyApiArg = {
  familyPk: string;
  id: string;
};
export type FamiliesContractsListApiResponse =
  /** status 200  */ ContractRead[];
export type FamiliesContractsListApiArg = {
  familyPk: string;
};
export type FamiliesContractsCreateApiResponse =
  /** status 201  */ ContractRead;
export type FamiliesContractsCreateApiArg = {
  familyPk: string;
  contractRequest: ContractRequestWrite;
};
export type FamiliesContractsChildrenListApiResponse =
  /** status 200  */ ContractChildRead[];
export type FamiliesContractsChildrenListApiArg = {
  contractPk: string;
  familyPk: string;
};
export type FamiliesContractsChildrenCreateApiResponse =
  /** status 201  */ ContractChildRead;
export type FamiliesContractsChildrenCreateApiArg = {
  contractPk: string;
  familyPk: string;
  contractChildRequest: ContractChildRequest;
};
export type FamiliesContractsChildrenRetrieveApiResponse =
  /** status 200  */ ContractChildRead;
export type FamiliesContractsChildrenRetrieveApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
};
export type FamiliesContractsChildrenUpdateApiResponse =
  /** status 200  */ ContractChildRead;
export type FamiliesContractsChildrenUpdateApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
  contractChildRequest: ContractChildRequest;
};
export type FamiliesContractsChildrenPartialUpdateApiResponse =
  /** status 200  */ ContractChildRead;
export type FamiliesContractsChildrenPartialUpdateApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
  patchedContractChildRequest: PatchedContractChildRequest;
};
export type FamiliesContractsChildrenDestroyApiResponse = unknown;
export type FamiliesContractsChildrenDestroyApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
};
export type FamiliesContractsDeclarationsListApiResponse =
  /** status 200  */ MonthlyDeclarationRead[];
export type FamiliesContractsDeclarationsListApiArg = {
  contractPk: string;
  familyPk: string;
  /** Month as YYYY-MM. Defaults to the current month. */
  month?: string;
};
export type FamiliesContractsDeclarationsRetrieveApiResponse =
  /** status 200  */ MonthlyDeclarationRead;
export type FamiliesContractsDeclarationsRetrieveApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
};
export type FamiliesContractsDeclarationsPartialUpdateApiResponse =
  /** status 200  */ MonthlyDeclarationRead;
export type FamiliesContractsDeclarationsPartialUpdateApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
  patchedMonthlyDeclarationRequest: PatchedMonthlyDeclarationRequest;
};
export type FamiliesContractsDeclarationsFileCreateApiResponse =
  /** status 200  */ MonthlyDeclarationRead;
export type FamiliesContractsDeclarationsFileCreateApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
};
export type FamiliesContractsExceptionalHoursListApiResponse =
  /** status 200  */ ExceptionalHoursRead[];
export type FamiliesContractsExceptionalHoursListApiArg = {
  contractPk: string;
  familyPk: string;
};
export type FamiliesContractsExceptionalHoursCreateApiResponse =
  /** status 201  */ ExceptionalHoursRead;
export type FamiliesContractsExceptionalHoursCreateApiArg = {
  contractPk: string;
  familyPk: string;
  exceptionalHoursRequest: ExceptionalHoursRequest;
};
export type FamiliesContractsExceptionalHoursRetrieveApiResponse =
  /** status 200  */ ExceptionalHoursRead;
export type FamiliesContractsExceptionalHoursRetrieveApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
};
export type FamiliesContractsExceptionalHoursUpdateApiResponse =
  /** status 200  */ ExceptionalHoursRead;
export type FamiliesContractsExceptionalHoursUpdateApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
  exceptionalHoursRequest: ExceptionalHoursRequest;
};
export type FamiliesContractsExceptionalHoursPartialUpdateApiResponse =
  /** status 200  */ ExceptionalHoursRead;
export type FamiliesContractsExceptionalHoursPartialUpdateApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
  patchedExceptionalHoursRequest: PatchedExceptionalHoursRequest;
};
export type FamiliesContractsExceptionalHoursDestroyApiResponse = unknown;
export type FamiliesContractsExceptionalHoursDestroyApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
};
export type FamiliesContractsExceptionalPresencesListApiResponse =
  /** status 200  */ ExceptionalPresenceRead[];
export type FamiliesContractsExceptionalPresencesListApiArg = {
  contractPk: string;
  familyPk: string;
};
export type FamiliesContractsExceptionalPresencesCreateApiResponse =
  /** status 201  */ ExceptionalPresenceRead;
export type FamiliesContractsExceptionalPresencesCreateApiArg = {
  contractPk: string;
  familyPk: string;
  exceptionalPresenceRequest: ExceptionalPresenceRequest;
};
export type FamiliesContractsExceptionalPresencesRetrieveApiResponse =
  /** status 200  */ ExceptionalPresenceRead;
export type FamiliesContractsExceptionalPresencesRetrieveApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
};
export type FamiliesContractsExceptionalPresencesUpdateApiResponse =
  /** status 200  */ ExceptionalPresenceRead;
export type FamiliesContractsExceptionalPresencesUpdateApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
  exceptionalPresenceRequest: ExceptionalPresenceRequest;
};
export type FamiliesContractsExceptionalPresencesPartialUpdateApiResponse =
  /** status 200  */ ExceptionalPresenceRead;
export type FamiliesContractsExceptionalPresencesPartialUpdateApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
  patchedExceptionalPresenceRequest: PatchedExceptionalPresenceRequest;
};
export type FamiliesContractsExceptionalPresencesDestroyApiResponse = unknown;
export type FamiliesContractsExceptionalPresencesDestroyApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
};
export type FamiliesContractsInvitationsListApiResponse =
  /** status 200  */ ContractInvitationRead[];
export type FamiliesContractsInvitationsListApiArg = {
  contractPk: string;
  familyPk: string;
};
export type FamiliesContractsInvitationsCreateApiResponse =
  /** status 201  */ ContractInvitationRead;
export type FamiliesContractsInvitationsCreateApiArg = {
  contractPk: string;
  familyPk: string;
  contractInvitationRequest: ContractInvitationRequest;
};
export type FamiliesContractsInvitationsDestroyApiResponse = unknown;
export type FamiliesContractsInvitationsDestroyApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
};
export type FamiliesContractsLeavesListApiResponse =
  /** status 200  */ LeaveRead[];
export type FamiliesContractsLeavesListApiArg = {
  contractPk: string;
  familyPk: string;
};
export type FamiliesContractsLeavesCreateApiResponse =
  /** status 201  */ LeaveRead;
export type FamiliesContractsLeavesCreateApiArg = {
  contractPk: string;
  familyPk: string;
  leaveRequest: LeaveRequest;
};
export type FamiliesContractsLeavesRetrieveApiResponse =
  /** status 200  */ LeaveRead;
export type FamiliesContractsLeavesRetrieveApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
};
export type FamiliesContractsLeavesUpdateApiResponse =
  /** status 200  */ LeaveRead;
export type FamiliesContractsLeavesUpdateApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
  leaveRequest: LeaveRequest;
};
export type FamiliesContractsLeavesPartialUpdateApiResponse =
  /** status 200  */ LeaveRead;
export type FamiliesContractsLeavesPartialUpdateApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
  patchedLeaveRequest: PatchedLeaveRequest;
};
export type FamiliesContractsLeavesDestroyApiResponse = unknown;
export type FamiliesContractsLeavesDestroyApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
};
export type FamiliesContractsScheduleListApiResponse =
  /** status 200  */ ContractScheduleRead[];
export type FamiliesContractsScheduleListApiArg = {
  contractPk: string;
  familyPk: string;
};
export type FamiliesContractsScheduleCreateApiResponse =
  /** status 201  */ ContractScheduleRead;
export type FamiliesContractsScheduleCreateApiArg = {
  contractPk: string;
  familyPk: string;
  contractScheduleRequest: ContractScheduleRequest;
};
export type FamiliesContractsScheduleRetrieveApiResponse =
  /** status 200  */ ContractScheduleRead;
export type FamiliesContractsScheduleRetrieveApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
};
export type FamiliesContractsScheduleUpdateApiResponse =
  /** status 200  */ ContractScheduleRead;
export type FamiliesContractsScheduleUpdateApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
  contractScheduleRequest: ContractScheduleRequest;
};
export type FamiliesContractsSchedulePartialUpdateApiResponse =
  /** status 200  */ ContractScheduleRead;
export type FamiliesContractsSchedulePartialUpdateApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
  patchedContractScheduleRequest: PatchedContractScheduleRequest;
};
export type FamiliesContractsScheduleDestroyApiResponse = unknown;
export type FamiliesContractsScheduleDestroyApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
};
export type FamiliesContractsTermsListApiResponse =
  /** status 200  */ ContractTermsRead[];
export type FamiliesContractsTermsListApiArg = {
  contractPk: string;
  familyPk: string;
};
export type FamiliesContractsTermsCreateApiResponse =
  /** status 201  */ ContractTermsRead;
export type FamiliesContractsTermsCreateApiArg = {
  contractPk: string;
  familyPk: string;
  contractTermsRequest: ContractTermsRequest;
};
export type FamiliesContractsTermsRetrieveApiResponse =
  /** status 200  */ ContractTermsRead;
export type FamiliesContractsTermsRetrieveApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
};
export type FamiliesContractsTermsUpdateApiResponse =
  /** status 200  */ ContractTermsRead;
export type FamiliesContractsTermsUpdateApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
  contractTermsRequest: ContractTermsRequest;
};
export type FamiliesContractsTermsPartialUpdateApiResponse =
  /** status 200  */ ContractTermsRead;
export type FamiliesContractsTermsPartialUpdateApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
  patchedContractTermsRequest: PatchedContractTermsRequest;
};
export type FamiliesContractsTermsDestroyApiResponse = unknown;
export type FamiliesContractsTermsDestroyApiArg = {
  contractPk: string;
  familyPk: string;
  id: string;
};
export type FamiliesContractsRetrieveApiResponse =
  /** status 200  */ ContractRead;
export type FamiliesContractsRetrieveApiArg = {
  familyPk: string;
  id: string;
};
export type FamiliesContractsUpdateApiResponse =
  /** status 200  */ ContractRead;
export type FamiliesContractsUpdateApiArg = {
  familyPk: string;
  id: string;
  contractRequest: ContractRequestWrite;
};
export type FamiliesContractsPartialUpdateApiResponse =
  /** status 200  */ ContractRead;
export type FamiliesContractsPartialUpdateApiArg = {
  familyPk: string;
  id: string;
  patchedContractRequest: PatchedContractRequestWrite;
};
export type FamiliesContractsDestroyApiResponse = unknown;
export type FamiliesContractsDestroyApiArg = {
  familyPk: string;
  id: string;
};
export type FamiliesContractsAttachFamilyCreateApiResponse =
  /** status 200  */ ContractRead;
export type FamiliesContractsAttachFamilyCreateApiArg = {
  familyPk: string;
  id: string;
  attachFamilyRequestRequest: AttachFamilyRequestRequest;
};
export type FamiliesContractsPaidLeaveRetrieveApiResponse =
  /** status 200  */ PaidLeaveBalanceRead;
export type FamiliesContractsPaidLeaveRetrieveApiArg = {
  familyPk: string;
  id: string;
};
export type FamiliesDashboardRetrieveApiResponse =
  /** status 200  */ DashboardRead;
export type FamiliesDashboardRetrieveApiArg = {
  familyPk: string;
  /** How many recent months of declarations to include (1–12, default 4). */
  months?: number;
};
export type FamiliesInvitationsListApiResponse =
  /** status 200  */ InvitationRead[];
export type FamiliesInvitationsListApiArg = {
  familyPk: string;
};
export type FamiliesInvitationsCreateApiResponse =
  /** status 201  */ InvitationRead;
export type FamiliesInvitationsCreateApiArg = {
  familyPk: string;
  invitationRequest: InvitationRequest;
};
export type FamiliesInvitationsDestroyApiResponse = unknown;
export type FamiliesInvitationsDestroyApiArg = {
  familyPk: string;
  id: string;
};
export type FamiliesMembersListApiResponse =
  /** status 200  */ FamilyMembershipRead[];
export type FamiliesMembersListApiArg = {
  familyPk: string;
};
export type FamiliesMembersDestroyApiResponse = unknown;
export type FamiliesMembersDestroyApiArg = {
  familyPk: string;
  id: string;
};
export type FamiliesPlanningRetrieveApiResponse =
  /** status 200  */ PlanningRead;
export type FamiliesPlanningRetrieveApiArg = {
  familyPk: string;
  /** Month as YYYY-MM. Defaults to the current month. */
  month?: string;
};
export type FamiliesSimulationRetrieveApiResponse =
  /** status 200  */ SimulationRead;
export type FamiliesSimulationRetrieveApiArg = {
  familyPk: string;
  /** First month of the window as YYYY-MM. Defaults to the current reference period's start (1 June). */
  from?: string;
  /** Last month of the window as YYYY-MM. Defaults to the current reference period's end (31 May), or eleven months after `from`. */
  to?: string;
};
export type FamiliesRetrieveApiResponse = /** status 200  */ FamilyRead;
export type FamiliesRetrieveApiArg = {
  /** A UUID string identifying this family. */
  id: string;
};
export type FamiliesUpdateApiResponse = /** status 200  */ FamilyRead;
export type FamiliesUpdateApiArg = {
  /** A UUID string identifying this family. */
  id: string;
  familyRequest: FamilyRequestWrite;
};
export type FamiliesPartialUpdateApiResponse = /** status 200  */ FamilyRead;
export type FamiliesPartialUpdateApiArg = {
  /** A UUID string identifying this family. */
  id: string;
  patchedFamilyRequest: PatchedFamilyRequestWrite;
};
export type FamiliesDestroyApiResponse = unknown;
export type FamiliesDestroyApiArg = {
  /** A UUID string identifying this family. */
  id: string;
};
export type FamiliesLeaveCreateApiResponse = unknown;
export type FamiliesLeaveCreateApiArg = {
  /** A UUID string identifying this family. */
  id: string;
};
export type HealthRetrieveApiResponse = /** status 200  */ HealthCheck;
export type HealthRetrieveApiArg = void;
export type HolidaysListApiResponse = /** status 200  */ BankHolidayRead[];
export type HolidaysListApiArg = {
  /** Restrict to holidays falling in this calendar year. */
  year?: number;
};
export type InvitationsListApiResponse = /** status 200  */ MyInvitationRead[];
export type InvitationsListApiArg = void;
export type InvitationsRetrieveApiResponse =
  /** status 200  */ InvitationPreviewRead;
export type InvitationsRetrieveApiArg = {
  token: string;
};
export type InvitationsAcceptCreateApiResponse = /** status 200  */ FamilyRead;
export type InvitationsAcceptCreateApiArg = {
  token: string;
};
export type InvitationsDeclineCreateApiResponse = unknown;
export type InvitationsDeclineCreateApiArg = {
  token: string;
};
export type MinimumWageRetrieveApiResponse = /** status 200  */ MinimumWage;
export type MinimumWageRetrieveApiArg = {
  /** Date (YYYY-MM-DD) the value must be in force on. Defaults to today. */
  on?: string;
};
export type PaidLeaveDefaultRetrieveApiResponse =
  /** status 200  */ PaidLeaveAllowance;
export type PaidLeaveDefaultRetrieveApiArg = {
  /** Date (YYYY-MM-DD) the value must be in force on. Defaults to today. */
  on?: string;
};
export type TokenBlacklistRequest = {};
export type TokenBlacklistRequestWrite = {
  refresh: string;
};
export type TokenObtainPair = {};
export type TokenObtainPairRead = {
  access: string;
  refresh: string;
};
export type TokenObtainPairRequest = {};
export type TokenObtainPairRequestWrite = {
  email: string;
  password: string;
};
export type TokenRefresh = {};
export type TokenRefreshRead = {
  access: string;
};
export type TokenRefreshRequest = {};
export type TokenRefreshRequestWrite = {
  refresh: string;
};
export type TokenVerifyRequest = {};
export type TokenVerifyRequestWrite = {
  token: string;
};
export type Profile = {
  first_name: string;
  last_name: string;
};
export type ProfileRead = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
};
export type Register = {
  email: string;
  first_name: string;
  last_name: string;
};
export type RegisterRead = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
};
export type RegisterRequest = {
  email: string;
  first_name?: string;
  last_name?: string;
};
export type RegisterRequestWrite = {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  invitation_token?: string;
};
export type ProfileRequest = {
  first_name?: string;
  last_name?: string;
};
export type PatchedProfileRequest = {
  first_name?: string;
  last_name?: string;
};
export type Activation = {
  uid: string;
  token: string;
};
export type ActivationRequest = {
  uid: string;
  token: string;
};
export type SendEmailReset = {
  email: string;
};
export type SendEmailResetRequest = {
  email: string;
};
export type UsernameResetConfirm = {
  new_email: string;
};
export type UsernameResetConfirmRequest = {
  new_email: string;
};
export type PasswordResetConfirm = {
  uid: string;
  token: string;
  new_password: string;
};
export type PasswordResetConfirmRequest = {
  uid: string;
  token: string;
  new_password: string;
};
export type SetEmail = {
  current_password: string;
  new_email: string;
};
export type SetEmailRequest = {
  current_password: string;
  new_email: string;
};
export type SetPassword = {
  new_password: string;
  current_password: string;
};
export type SetPasswordRequest = {
  new_password: string;
  current_password: string;
};
export type MyContractInvitation = {};
export type MyContractInvitationRead = {
  id: string;
  nanny_first_name: string;
  nanny_last_name: string;
  token: string;
  expires_at: string;
};
export type ContractInvitationPreview = {};
export type InvitationStatusEnum =
  "pending" | "accepted" | "declined" | "revoked";
export type ContractInvitationPreviewRead = {
  email: string;
  status: InvitationStatusEnum;
  nanny_first_name: string;
  nanny_last_name: string;
  expires_at: string;
};
export type SplitMethodEnum = "equal" | "by_children";
export type Contract = {
  starting_date: string;
  ending_date: string | null;
  split_method: SplitMethodEnum;
  paid_leave_days: number;
  notes: string;
};
export type NannyBrief = {};
export type NannyBriefRead = {
  id: string;
  first_name: string;
  last_name: string;
};
export type ContractFamily = {};
export type ContractFamilyRead = {
  id: string;
  name: string;
  is_originator: boolean;
};
export type ContractTerms = {
  effective_from: string;
  net_hourly_rate: string;
  night_presence_rate: string;
  transport_fee: string;
  mileage_rate: string;
  benefits_in_kind: string;
};
export type ContractTermsRead = {
  id: string;
  effective_from: string;
  effective_to: string | null;
  net_hourly_rate: string;
  night_presence_rate: string;
  transport_fee: string;
  mileage_rate: string;
  benefits_in_kind: string;
  minimum_net_hourly_rate: string | null;
  below_minimum: boolean;
  warnings: string[];
  edited: boolean;
  created_by_name: string | null;
};
export type WeekdayEnum = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type ScheduleBlock = {
  weekday: WeekdayEnum;
  start_time: string;
  end_time: string;
};
export type ScheduleBlockRead = {
  id: string;
  weekday: WeekdayEnum;
  start_time: string;
  end_time: string;
};
export type ContractSchedule = {
  effective_from: string;
  blocks: ScheduleBlock[];
};
export type ContractScheduleRead = {
  id: string;
  effective_from: string;
  effective_to: string | null;
  weekly_hours: number;
  edited: boolean;
  created_by_name: string | null;
  blocks: ScheduleBlockRead[];
};
export type ContractRead = {
  id: string;
  nanny: NannyBriefRead;
  starting_date: string;
  ending_date: string | null;
  split_method: SplitMethodEnum;
  paid_leave_days: number;
  notes: string;
  families: ContractFamilyRead[];
  current_terms: ContractTermsRead | null;
  current_schedule: ContractScheduleRead | null;
};
export type AcceptContractInvitationRequestRequest = {
  family_id: string;
};
export type Family = {
  name: string;
};
export type FamilyRead = {
  id: string;
  name: string;
  role: string | null;
  is_claimed: boolean;
  created_at: string;
};
export type FamilyRequest = {
  name: string;
};
export type FamilyRequestWrite = {
  name: string;
  claim?: boolean;
};
export type Child = {
  first_name: string;
};
export type ChildRead = {
  id: string;
  first_name: string;
};
export type ChildRequest = {
  first_name: string;
};
export type PatchedChildRequest = {
  first_name?: string;
};
export type ContractRequest = {
  starting_date: string;
  ending_date?: string | null;
  split_method?: SplitMethodEnum;
  paid_leave_days?: number;
  notes?: string;
};
export type ContractRequestWrite = {
  nanny_id?: string;
  first_name?: string;
  last_name?: string;
  starting_date: string;
  ending_date?: string | null;
  split_method?: SplitMethodEnum;
  paid_leave_days?: number;
  notes?: string;
};
export type ContractChildWindow = {
  weekday: WeekdayEnum;
  start_time: string;
  end_time: string;
};
export type ContractChildWindowRead = {
  id: string;
  weekday: WeekdayEnum;
  start_time: string;
  end_time: string;
};
export type ContractChild = {
  child: string;
  windows: ContractChildWindow[];
};
export type ContractChildRead = {
  id: string;
  child: string;
  first_name: string;
  family_id: string;
  windows: ContractChildWindowRead[];
};
export type ContractChildWindowRequest = {
  weekday: WeekdayEnum;
  start_time: string;
  end_time: string;
};
export type ContractChildRequest = {
  child: string;
  windows?: ContractChildWindowRequest[];
};
export type PatchedContractChildRequest = {
  child?: string;
  windows?: ContractChildWindowRequest[];
};
export type MonthlyDeclaration = {
  kilometers: string;
};
export type MonthlyDeclarationStatusEnum = "draft" | "filed";
export type TenthReconciliation = {};
export type TenthReconciliationRead = {
  period_start: string;
  period_end: string;
  assiette_brut: string;
  tenth_brut: string;
  maintien_brut: string;
  rappel_brut: string;
  rappel_net: string;
};
export type RatePeriod = {
  from: string;
  to: string;
  days: number;
  net_hourly_rate: string;
  night_presence_rate: string;
  transport_fee: string;
  mileage_rate: string;
  benefits_in_kind: string;
};
export type DeclarationWarning = {};
export type Source = {};
export type SourceRead = {
  ref: string;
  url: string;
  quote: string;
};
export type DeclarationWarningRead = {
  code: string;
  source: SourceRead | null;
};
export type MonthlyDeclarationRead = {
  id: string;
  family: string;
  family_name: string;
  month: string;
  status: MonthlyDeclarationStatusEnum;
  normal_hours: string;
  hours_25: string;
  hours_50: string;
  net_salary: string;
  total_amount: string;
  transport_amount: string;
  benefits_in_kind_amount: string;
  kilometers: string;
  mileage_amount: string;
  night_count: number;
  night_indemnity: string;
  holiday_majoration: string;
  paid_leave_rappel: string | null;
  paid_leave_tenth: TenthReconciliationRead | null;
  paid_leave_compensatrice: string | null;
  net_hourly_rate: string;
  gross_hourly_rate: string | null;
  night_presence_rate: string;
  mileage_rate: string;
  rate_periods: RatePeriod[];
  warnings: DeclarationWarningRead[];
  computed_at: string;
  filed_at: string | null;
  is_editable: boolean;
  editable_until: string;
};
export type PatchedMonthlyDeclarationRequest = {
  kilometers?: string;
};
export type KindEnum = "effective" | "presence_responsable" | "night_presence";
export type ExceptionalHours = {
  kind: KindEnum;
  is_shared: boolean;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  interventions: number;
  notes: string;
};
export type ExceptionalHoursRead = {
  id: string;
  family: string;
  kind: KindEnum;
  is_shared: boolean;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  interventions: number;
  notes: string;
};
export type ExceptionalHoursRequest = {
  kind?: KindEnum;
  is_shared?: boolean;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  interventions?: number;
  notes?: string;
};
export type PatchedExceptionalHoursRequest = {
  kind?: KindEnum;
  is_shared?: boolean;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  interventions?: number;
  notes?: string;
};
export type ExceptionalPresence = {
  child: string;
  date: string;
  start_time: string;
  end_time: string;
  notes: string;
};
export type ExceptionalPresenceRead = {
  id: string;
  child: string;
  first_name: string;
  date: string;
  start_time: string;
  end_time: string;
  notes: string;
};
export type ExceptionalPresenceRequest = {
  child: string;
  date: string;
  start_time: string;
  end_time: string;
  notes?: string;
};
export type PatchedExceptionalPresenceRequest = {
  child?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  notes?: string;
};
export type ContractInvitation = {
  email: string;
};
export type ContractInvitationRead = {
  id: string;
  email: string;
  status: InvitationStatusEnum;
  token: string;
  created_at: string;
  expires_at: string;
};
export type ContractInvitationRequest = {
  email: string;
};
export type LeaveTypeEnum = "paid" | "unpaid" | "sickness" | "maternity";
export type PortionEnum = "full_day" | "half_day" | "hourly";
export type Leave = {
  leave_type: LeaveTypeEnum;
  start_date: string;
  end_date: string;
  portion: PortionEnum;
  hours: string | null;
  notes: string;
};
export type LeaveRead = {
  id: string;
  leave_type: LeaveTypeEnum;
  start_date: string;
  end_date: string;
  portion: PortionEnum;
  hours: string | null;
  notes: string;
};
export type LeaveRequest = {
  leave_type: LeaveTypeEnum;
  start_date: string;
  end_date: string;
  portion?: PortionEnum;
  hours?: string | null;
  notes?: string;
};
export type PatchedLeaveRequest = {
  leave_type?: LeaveTypeEnum;
  start_date?: string;
  end_date?: string;
  portion?: PortionEnum;
  hours?: string | null;
  notes?: string;
};
export type ScheduleBlockRequest = {
  weekday: WeekdayEnum;
  start_time: string;
  end_time: string;
};
export type ContractScheduleRequest = {
  effective_from?: string;
  blocks: ScheduleBlockRequest[];
};
export type PatchedContractScheduleRequest = {
  effective_from?: string;
  blocks?: ScheduleBlockRequest[];
};
export type ContractTermsRequest = {
  effective_from?: string;
  net_hourly_rate: string;
  night_presence_rate?: string;
  transport_fee?: string;
  mileage_rate?: string;
  benefits_in_kind?: string;
};
export type PatchedContractTermsRequest = {
  effective_from?: string;
  net_hourly_rate?: string;
  night_presence_rate?: string;
  transport_fee?: string;
  mileage_rate?: string;
  benefits_in_kind?: string;
};
export type PatchedContractRequest = {
  starting_date?: string;
  ending_date?: string | null;
  split_method?: SplitMethodEnum;
  paid_leave_days?: number;
  notes?: string;
};
export type PatchedContractRequestWrite = {
  nanny_id?: string;
  first_name?: string;
  last_name?: string;
  starting_date?: string;
  ending_date?: string | null;
  split_method?: SplitMethodEnum;
  paid_leave_days?: number;
  notes?: string;
};
export type AttachFamilyRequestRequest = {
  family_id: string;
};
export type PaidLeaveBalance = {};
export type PaidLeaveBalanceRead = {
  period_start: string;
  period_end: string;
  total_days: string;
  accrued: string;
  taken: string;
  remaining: string;
  tenth: TenthReconciliationRead | null;
};
export type Dashboard = {};
export type DashboardContract = {
  starting_date: string;
  ending_date: string | null;
  split_method: SplitMethodEnum;
  paid_leave_days: number;
  notes: string;
};
export type RecentDeclaration = {};
export type RecentDeclarationRead = {
  /** The month as YYYY-MM. */
  month: string;
  net_salary: string;
  status: MonthlyDeclarationStatusEnum;
};
export type DashboardContractRead = {
  id: string;
  nanny: NannyBriefRead;
  starting_date: string;
  ending_date: string | null;
  split_method: SplitMethodEnum;
  paid_leave_days: number;
  notes: string;
  families: ContractFamilyRead[];
  current_terms: ContractTermsRead | null;
  current_schedule: ContractScheduleRead | null;
  paid_leave_balance: PaidLeaveBalanceRead;
  recent_declarations: RecentDeclarationRead[];
};
export type DashboardRead = {
  contracts: DashboardContractRead[];
};
export type RoleEnum = "owner" | "member";
export type Invitation = {
  email: string;
  role: RoleEnum;
};
export type InvitationRead = {
  id: string;
  email: string;
  role: RoleEnum;
  status: InvitationStatusEnum;
  token: string;
  created_at: string;
  expires_at: string;
};
export type InvitationRequest = {
  email: string;
  role?: RoleEnum;
};
export type FamilyMembership = {};
export type FamilyMembershipRead = {
  id: string;
  user: string;
  email: string;
  first_name: string;
  last_name: string;
  role: RoleEnum;
  joined_at: string;
};
export type Planning = {};
export type PlanningContract = {
  starting_date: string;
  ending_date: string | null;
  split_method: SplitMethodEnum;
  paid_leave_days: number;
  notes: string;
};
export type PlanningContractRead = {
  id: string;
  nanny: NannyBriefRead;
  starting_date: string;
  ending_date: string | null;
  split_method: SplitMethodEnum;
  paid_leave_days: number;
  notes: string;
  families: ContractFamilyRead[];
  current_terms: ContractTermsRead | null;
  current_schedule: ContractScheduleRead | null;
  schedule_history: ContractScheduleRead[];
  leaves: LeaveRead[];
  exceptional_hours: ExceptionalHoursRead[];
  exceptional_presences: ExceptionalPresenceRead[];
  children: ContractChildRead[];
};
export type BankHoliday = {
  name: string;
  date: string;
  is_workable: boolean;
};
export type BankHolidayRead = {
  id: string;
  name: string;
  date: string;
  is_workable: boolean;
};
export type PlanningRead = {
  contracts: PlanningContractRead[];
  holidays: BankHolidayRead[];
};
export type Simulation = {};
export type SimulationContract = {
  starting_date: string;
  ending_date: string | null;
  split_method: SplitMethodEnum;
  paid_leave_days: number;
  notes: string;
};
export type SimulationMonth = {};
export type SimulationMonthRead = {
  /** The month as YYYY-MM. */
  month: string;
  net_wage: string;
  transport: string;
  mileage: string;
  benefits_in_kind: string;
  paid_leave_rappel: string;
  total: string;
};
export type SimulationContractRead = {
  id: string;
  nanny: NannyBriefRead;
  starting_date: string;
  ending_date: string | null;
  split_method: SplitMethodEnum;
  paid_leave_days: number;
  notes: string;
  families: ContractFamilyRead[];
  current_terms: ContractTermsRead | null;
  current_schedule: ContractScheduleRead | null;
  months: SimulationMonthRead[];
  total: string;
};
export type SimulationRead = {
  period_start: string;
  period_end: string;
  contracts: SimulationContractRead[];
};
export type PatchedFamilyRequest = {
  name?: string;
};
export type PatchedFamilyRequestWrite = {
  name?: string;
  claim?: boolean;
};
export type HealthCheck = {
  status: string;
};
export type MyInvitation = {};
export type MyInvitationRead = {
  id: string;
  family_name: string;
  role: RoleEnum;
  token: string;
  expires_at: string;
};
export type InvitationPreview = {};
export type InvitationPreviewRead = {
  email: string;
  role: RoleEnum;
  status: InvitationStatusEnum;
  family_name: string;
  expires_at: string;
};
export type MinimumWage = {
  net_hourly_rate: string | null;
};
export type PaidLeaveAllowance = {
  annual_days: number | null;
};
export const {
  useAuthJwtBlacklistCreateMutation,
  useAuthJwtCreateCreateMutation,
  useAuthJwtRefreshCreateMutation,
  useAuthJwtVerifyCreateMutation,
  useAuthUsersListQuery,
  useAuthUsersCreateMutation,
  useAuthUsersRetrieveQuery,
  useAuthUsersUpdateMutation,
  useAuthUsersPartialUpdateMutation,
  useAuthUsersDestroyMutation,
  useAuthUsersActivationCreateMutation,
  useAuthUsersMeRetrieveQuery,
  useAuthUsersMeUpdateMutation,
  useAuthUsersMePartialUpdateMutation,
  useAuthUsersMeDestroyMutation,
  useAuthUsersResendActivationCreateMutation,
  useAuthUsersResetEmailCreateMutation,
  useAuthUsersResetEmailConfirmCreateMutation,
  useAuthUsersResetPasswordCreateMutation,
  useAuthUsersResetPasswordConfirmCreateMutation,
  useAuthUsersSetEmailCreateMutation,
  useAuthUsersSetPasswordCreateMutation,
  useContractInvitationsListQuery,
  useContractInvitationsRetrieveQuery,
  useContractInvitationsAcceptCreateMutation,
  useContractInvitationsDeclineCreateMutation,
  useFamiliesListQuery,
  useFamiliesCreateMutation,
  useFamiliesChildrenListQuery,
  useFamiliesChildrenCreateMutation,
  useFamiliesChildrenRetrieveQuery,
  useFamiliesChildrenUpdateMutation,
  useFamiliesChildrenPartialUpdateMutation,
  useFamiliesChildrenDestroyMutation,
  useFamiliesContractsListQuery,
  useFamiliesContractsCreateMutation,
  useFamiliesContractsChildrenListQuery,
  useFamiliesContractsChildrenCreateMutation,
  useFamiliesContractsChildrenRetrieveQuery,
  useFamiliesContractsChildrenUpdateMutation,
  useFamiliesContractsChildrenPartialUpdateMutation,
  useFamiliesContractsChildrenDestroyMutation,
  useFamiliesContractsDeclarationsListQuery,
  useFamiliesContractsDeclarationsRetrieveQuery,
  useFamiliesContractsDeclarationsPartialUpdateMutation,
  useFamiliesContractsDeclarationsFileCreateMutation,
  useFamiliesContractsExceptionalHoursListQuery,
  useFamiliesContractsExceptionalHoursCreateMutation,
  useFamiliesContractsExceptionalHoursRetrieveQuery,
  useFamiliesContractsExceptionalHoursUpdateMutation,
  useFamiliesContractsExceptionalHoursPartialUpdateMutation,
  useFamiliesContractsExceptionalHoursDestroyMutation,
  useFamiliesContractsExceptionalPresencesListQuery,
  useFamiliesContractsExceptionalPresencesCreateMutation,
  useFamiliesContractsExceptionalPresencesRetrieveQuery,
  useFamiliesContractsExceptionalPresencesUpdateMutation,
  useFamiliesContractsExceptionalPresencesPartialUpdateMutation,
  useFamiliesContractsExceptionalPresencesDestroyMutation,
  useFamiliesContractsInvitationsListQuery,
  useFamiliesContractsInvitationsCreateMutation,
  useFamiliesContractsInvitationsDestroyMutation,
  useFamiliesContractsLeavesListQuery,
  useFamiliesContractsLeavesCreateMutation,
  useFamiliesContractsLeavesRetrieveQuery,
  useFamiliesContractsLeavesUpdateMutation,
  useFamiliesContractsLeavesPartialUpdateMutation,
  useFamiliesContractsLeavesDestroyMutation,
  useFamiliesContractsScheduleListQuery,
  useFamiliesContractsScheduleCreateMutation,
  useFamiliesContractsScheduleRetrieveQuery,
  useFamiliesContractsScheduleUpdateMutation,
  useFamiliesContractsSchedulePartialUpdateMutation,
  useFamiliesContractsScheduleDestroyMutation,
  useFamiliesContractsTermsListQuery,
  useFamiliesContractsTermsCreateMutation,
  useFamiliesContractsTermsRetrieveQuery,
  useFamiliesContractsTermsUpdateMutation,
  useFamiliesContractsTermsPartialUpdateMutation,
  useFamiliesContractsTermsDestroyMutation,
  useFamiliesContractsRetrieveQuery,
  useFamiliesContractsUpdateMutation,
  useFamiliesContractsPartialUpdateMutation,
  useFamiliesContractsDestroyMutation,
  useFamiliesContractsAttachFamilyCreateMutation,
  useFamiliesContractsPaidLeaveRetrieveQuery,
  useFamiliesDashboardRetrieveQuery,
  useFamiliesInvitationsListQuery,
  useFamiliesInvitationsCreateMutation,
  useFamiliesInvitationsDestroyMutation,
  useFamiliesMembersListQuery,
  useFamiliesMembersDestroyMutation,
  useFamiliesPlanningRetrieveQuery,
  useFamiliesSimulationRetrieveQuery,
  useFamiliesRetrieveQuery,
  useFamiliesUpdateMutation,
  useFamiliesPartialUpdateMutation,
  useFamiliesDestroyMutation,
  useFamiliesLeaveCreateMutation,
  useHealthRetrieveQuery,
  useHolidaysListQuery,
  useInvitationsListQuery,
  useInvitationsRetrieveQuery,
  useInvitationsAcceptCreateMutation,
  useInvitationsDeclineCreateMutation,
  useMinimumWageRetrieveQuery,
  usePaidLeaveDefaultRetrieveQuery,
} = injectedRtkApi;
