// ── Domain types ──────────────────────────────────────────────────────────────

/**
 * @typedef {"admin"|"manager"|"staff"|"viewer"} Role
 * @typedef {"new"|"good"|"fair"|"poor"} Condition
 * @typedef {"receive"|"consume"|"transfer_out"|"transfer_in"|"adjustment"} TransactionType
 * @typedef {"free"|"pro"} Plan
 * @typedef {"in"|"cm"} MeasurementUnit
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
 * @property {number | null} length_cm actual inside dimension (measured); used for fit
 * @property {number | null} width_cm actual inside dimension (measured); used for fit
 * @property {number | null} height_cm actual inside dimension (measured); used for fit
 * @property {number | null} printed_length_cm nominal size printed on the box; names the carton
 * @property {number | null} printed_width_cm nominal size printed on the box; names the carton
 * @property {number | null} printed_height_cm nominal size printed on the box; names the carton
 * @property {number} wall_thickness_cm outer = inside + 2 × wall thickness
 * @property {number | null} unit_cost
 * @property {string | null} notes
 * @property {string | null} source_code
 * @property {string | null} size_code
 * @property {1 | 0} resizable height can be cut down to fit the item
 * @property {number} created_at
 */

/**
 * @typedef {object} RetailCartonOption
 * @property {string} id
 * @property {string} store_name
 * @property {string | null} city
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
 * @typedef {object} CartonSuggestion
 * @property {string} id
 * @property {string} name
 * @property {string | null} sku
 * @property {number} length_cm
 * @property {number} width_cm
 * @property {number} height_cm
 * @property {number | null} printed_length_cm
 * @property {number | null} printed_width_cm
 * @property {number | null} printed_height_cm
 * @property {number} wall_thickness_cm outer = inside + 2 × wall thickness
 * @property {number} quantity
 * @property {number} leftover_volume_cm3 after cutting down, if resize_height_cm is set
 * @property {number | null} resize_height_cm cut the carton down to this height; null = use as-is
 */

/**
 * @typedef {object} RetailCartonSuggestion
 * @property {string} id
 * @property {string} store_name
 * @property {string | null} city
 * @property {string} name
 * @property {string | null} sku
 * @property {number} length_cm
 * @property {number} width_cm
 * @property {number} height_cm
 * @property {number | null} cost
 * @property {number} leftover_volume_cm3
 */

/**
 * @typedef {object} SuggestCartonResult
 * @property {CartonSuggestion[]} onSite
 * @property {RetailCartonSuggestion[]} retail
 */

/**
 * @typedef {object} Organization
 * @property {string} id
 * @property {string} name
 * @property {Plan} plan
 * @property {number | null} default_tax_percent
 * @property {MeasurementUnit} measurement_unit
 * @property {number} created_at
 */

export {};
