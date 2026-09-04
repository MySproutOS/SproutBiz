// Thin indirection over the generated admin API client so that a single file
// needs touching if the generated hook names change after regeneration.
// These names assume admin/index.ts mounts: .route("/users", user)
// .route("/posts", post) .route("/stats", stats)
export {
  getApiAdminStatsOptions,
  getApiAdminUsersOptions,
  getApiAdminUsersQueryKey,
  getApiAdminPostsOptions,
  getApiAdminPostsQueryKey,
  postApiAdminUsersByIdSuspendMutation,
  postApiAdminUsersByIdUnsuspendMutation,
  postApiAdminPostsByIdRemoveMutation,
  postApiAdminPostsByIdRestoreMutation,
} from "@lib/api-client/admin-generated/@tanstack/react-query.gen"

export {
  getApiAdminContributionsOptions,
  getApiAdminContributionsQueryKey,
  postApiAdminContributionsCodeMonthsByIdFinalizeMutation,
  postApiAdminContributionsCodeMonthsByIdRejectMutation,
  postApiAdminContributionsSubmissionsByIdAcceptIdeaMutation,
  postApiAdminContributionsSubmissionsByIdAcceptMutation,
  postApiAdminContributionsSubmissionsByIdRejectMutation,
} from "@lib/api-client/admin-generated/@tanstack/react-query.gen"

// Marketing / Earn Money. Mounted by admin/index.ts as .route("/marketing", marketing).
export {
  getApiAdminMarketingVideosOptions,
  getApiAdminMarketingVideosQueryKey,
  postApiAdminMarketingVideosByIdApproveMutation,
  postApiAdminMarketingVideosByIdRejectMutation,
  postApiAdminMarketingVideosByIdViewsMutation,
  getApiAdminMarketingPoolsOptions,
  getApiAdminMarketingPoolsQueryKey,
  putApiAdminMarketingPoolsMutation,
  postApiAdminMarketingPoolsByIdCalculateMutation,
  getApiAdminMarketingPoolsByIdPayoutsOptions,
  getApiAdminMarketingPoolsByIdPayoutsQueryKey,
  postApiAdminMarketingPoolsByIdPayMutation,
} from "@lib/api-client/admin-generated/@tanstack/react-query.gen"
