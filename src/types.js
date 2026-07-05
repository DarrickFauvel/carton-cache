// ── Domain types ──────────────────────────────────────────────────────────────

/**
 * @typedef {"admin"|"manager"|"staff"|"viewer"} Role
 * @typedef {"new"|"good"|"fair"|"poor"} Condition
 * @typedef {"receive"|"consume"|"transfer_out"|"transfer_in"|"adjustment"} TransactionType
 * @typedef {"free"|"pro"} Plan
 */

/**
 * @typedef {object} User
 * @property {string} id
 * @property {string} email
 * @property {string} name
 * @property {string} password_hash
 * @property {Role} role
 * @property {string[]} location_ids stored as JSON in DB
 * @property {string} avatar_color
 * @property {string} org_id
 * @property {number} created_at
 */

/**
 * @typedef {object} Location
 * @property {string} id
 * @property {string} name
 * @property {string | null} address
 * @property {1 | 0} active
 * @property {number} created_at
 */

/**
 * @typedef {object} CartonType
 * @property {string} id
 * @property {string} name
 * @property {string | null} sku
 * @property {string | null} barcode
 * @property {number | null} length_cm
 * @property {number | null} width_cm
 * @property {number | null} height_cm
 * @property {number | null} unit_cost
 * @property {string | null} notes
 * @property {number} created_at
 */

/**
 * @typedef {object} RetailCartonOption
 * @property {string} id
 * @property {string} store_name
 * @property {string} name
 * @property {string | null} sku
 * @property {number | null} length_in
 * @property {number | null} width_in
 * @property {number | null} height_in
 * @property {number | null} weight_lb
 * @property {number | null} cost
 * @property {number | null} tax_percent
 * @property {string | null} notes
 * @property {number} created_at
 */

/**
 * @typedef {object} InventoryLot
 * @property {string} id
 * @property {string} location_id
 * @property {string} carton_type_id
 * @property {Condition} condition
 * @property {number} quantity
 * @property {number} updated_at
 */

/**
 * @typedef {object} Transaction
 * @property {string} id
 * @property {TransactionType} type
 * @property {string} carton_type_id
 * @property {Condition} condition
 * @property {number} quantity
 * @property {number | null} unit_cost_snapshot
 * @property {string} location_id
 * @property {string | null} linked_transaction_id
 * @property {string} user_id
 * @property {string | null} notes
 * @property {number} created_at
 */

/**
 * @typedef {object} AlertThreshold
 * @property {string} id
 * @property {string} location_id
 * @property {string} carton_type_id
 * @property {string} condition Condition | 'any'
 * @property {number} min_quantity
 */

/**
 * @typedef {object} PushSubscription
 * @property {string} id
 * @property {string} user_id
 * @property {string} endpoint
 * @property {string} p256dh
 * @property {string} auth
 * @property {number} created_at
 */

/**
 * @typedef {object} Organization
 * @property {string} id
 * @property {string} name
 * @property {Plan} plan
 * @property {number | null} default_tax_percent
 * @property {number} created_at
 */

export {};
