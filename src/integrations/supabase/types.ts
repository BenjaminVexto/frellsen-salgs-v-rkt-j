export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _location_dedup_report: {
        Row: {
          created_at: string
          detail: string | null
          id: number
          kind: string
          n: number | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: number
          kind: string
          n?: number | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: number
          kind?: string
          n?: number | null
        }
        Relationships: []
      }
      _product_master_import_log: {
        Row: {
          id: number
          report: Json | null
          run_at: string
        }
        Insert: {
          id?: number
          report?: Json | null
          run_at?: string
        }
        Update: {
          id?: number
          report?: Json | null
          run_at?: string
        }
        Relationships: []
      }
      activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          afdeling_nr: number
          company_id: string
          contact_list_assignment_id: string | null
          created_at: string
          created_by: string
          id: string
          location_id: string | null
          next_action: string | null
          next_followup_date: string | null
          note: string | null
          opportunity_id: string | null
          udfoert_at: string
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          afdeling_nr?: number
          company_id: string
          contact_list_assignment_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          location_id?: string | null
          next_action?: string | null
          next_followup_date?: string | null
          note?: string | null
          opportunity_id?: string | null
          udfoert_at?: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          afdeling_nr?: number
          company_id?: string
          contact_list_assignment_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          location_id?: string | null
          next_action?: string | null
          next_followup_date?: string | null
          note?: string | null
          opportunity_id?: string | null
          udfoert_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
          {
            foreignKeyName: "activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "activities_contact_list_assignment_id_fkey"
            columns: ["contact_list_assignment_id"]
            isOneToOne: false
            referencedRelation: "contact_list_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_created_by_profiles_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "sales_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      afdeling: {
        Row: {
          afdeling_nr: number
          aktiv: boolean
          firma_nr: number | null
          navn: string
        }
        Insert: {
          afdeling_nr: number
          aktiv?: boolean
          firma_nr?: number | null
          navn: string
        }
        Update: {
          afdeling_nr?: number
          aktiv?: boolean
          firma_nr?: number | null
          navn?: string
        }
        Relationships: []
      }
      afdeling_alias: {
        Row: {
          afdeling_nr: number
          kilde_afdeling_nr: number
        }
        Insert: {
          afdeling_nr: number
          kilde_afdeling_nr: number
        }
        Update: {
          afdeling_nr?: number
          kilde_afdeling_nr?: number
        }
        Relationships: [
          {
            foreignKeyName: "afdeling_alias_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
        ]
      }
      agreement_pricing: {
        Row: {
          afdeling_nr: number
          beskrivelse: string | null
          created_at: string
          fak_kundenr: string | null
          fra_dato: string | null
          id: string
          kampagne: string | null
          kommentar: string | null
          kundeprisgruppe1: string | null
          kundeprisgruppe2: string | null
          last_seen_import: string | null
          produktprisgruppe1: string | null
          produktprisgruppe2: string | null
          produktprisgruppe3: string | null
          rab_kr: number | null
          rab_pct: number | null
          rabat_kategori: string | null
          record_status: string
          saerpris_kr: number | null
          til_dato: string | null
          udgaaet_dato: string | null
          udlejningspris: number | null
          udsalgspris: number | null
          updated_at: string
          varenr: string | null
        }
        Insert: {
          afdeling_nr?: number
          beskrivelse?: string | null
          created_at?: string
          fak_kundenr?: string | null
          fra_dato?: string | null
          id: string
          kampagne?: string | null
          kommentar?: string | null
          kundeprisgruppe1?: string | null
          kundeprisgruppe2?: string | null
          last_seen_import?: string | null
          produktprisgruppe1?: string | null
          produktprisgruppe2?: string | null
          produktprisgruppe3?: string | null
          rab_kr?: number | null
          rab_pct?: number | null
          rabat_kategori?: string | null
          record_status?: string
          saerpris_kr?: number | null
          til_dato?: string | null
          udgaaet_dato?: string | null
          udlejningspris?: number | null
          udsalgspris?: number | null
          updated_at?: string
          varenr?: string | null
        }
        Update: {
          afdeling_nr?: number
          beskrivelse?: string | null
          created_at?: string
          fak_kundenr?: string | null
          fra_dato?: string | null
          id?: string
          kampagne?: string | null
          kommentar?: string | null
          kundeprisgruppe1?: string | null
          kundeprisgruppe2?: string | null
          last_seen_import?: string | null
          produktprisgruppe1?: string | null
          produktprisgruppe2?: string | null
          produktprisgruppe3?: string | null
          rab_kr?: number | null
          rab_pct?: number | null
          rabat_kategori?: string | null
          record_status?: string
          saerpris_kr?: number | null
          til_dato?: string | null
          udgaaet_dato?: string | null
          udlejningspris?: number | null
          udsalgspris?: number | null
          updated_at?: string
          varenr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_pricing_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
        ]
      }
      agreements: {
        Row: {
          aftale_type: Database["public"]["Enums"]["agreement_type"]
          aftale_type_manuel: boolean
          created_at: string
          created_by: string | null
          document_filename: string | null
          document_path: string | null
          governing_party_company_id: string | null
          governing_party_name: string | null
          id: string
          is_public_sector: boolean
          kp1_code: string | null
          kp2_code: string | null
          maskiner_folger_hovedaftale: boolean
          name: string
          notes: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          aftale_type?: Database["public"]["Enums"]["agreement_type"]
          aftale_type_manuel?: boolean
          created_at?: string
          created_by?: string | null
          document_filename?: string | null
          document_path?: string | null
          governing_party_company_id?: string | null
          governing_party_name?: string | null
          id?: string
          is_public_sector?: boolean
          kp1_code?: string | null
          kp2_code?: string | null
          maskiner_folger_hovedaftale?: boolean
          name: string
          notes?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          aftale_type?: Database["public"]["Enums"]["agreement_type"]
          aftale_type_manuel?: boolean
          created_at?: string
          created_by?: string | null
          document_filename?: string | null
          document_path?: string | null
          governing_party_company_id?: string | null
          governing_party_name?: string | null
          id?: string
          is_public_sector?: boolean
          kp1_code?: string | null
          kp2_code?: string | null
          maskiner_folger_hovedaftale?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreements_governing_party_company_id_fkey"
            columns: ["governing_party_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreements_governing_party_company_id_fkey"
            columns: ["governing_party_company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
        ]
      }
      aktoer_lokation_staging: {
        Row: {
          afdeling_nr: number
          batch: string
          fakt_kunde: string | null
          kreditspaerret: boolean
          lev_kund: string
          saelger_no: string | null
        }
        Insert: {
          afdeling_nr: number
          batch: string
          fakt_kunde?: string | null
          kreditspaerret?: boolean
          lev_kund: string
          saelger_no?: string | null
        }
        Update: {
          afdeling_nr?: number
          batch?: string
          fakt_kunde?: string | null
          kreditspaerret?: boolean
          lev_kund?: string
          saelger_no?: string | null
        }
        Relationships: []
      }
      bonus_historik_loenseddel: {
        Row: {
          importeret_af: string | null
          importeret_at: string
          loen_1561: number
          loen_1563: number
          loenseddel_maaned: string
          maaned: string
          user_id: string
        }
        Insert: {
          importeret_af?: string | null
          importeret_at?: string
          loen_1561?: number
          loen_1563?: number
          loenseddel_maaned: string
          maaned: string
          user_id: string
        }
        Update: {
          importeret_af?: string | null
          importeret_at?: string
          loen_1561?: number
          loen_1563?: number
          loenseddel_maaned?: string
          maaned?: string
          user_id?: string
        }
        Relationships: []
      }
      bonus_laas: {
        Row: {
          antal_animo: number | null
          antal_rex: number | null
          antal_wittenborg: number | null
          db_bonus: number | null
          db_grundlag: number | null
          db_provision_pct: number | null
          kilde: string
          laast_af: string | null
          laast_at: string
          laast_note: string | null
          loen_1561: number
          loen_1563: number
          maaned: string
          maskinbonus: number | null
          maskiner: Json
          ny_kunde_bonus: number
          ny_kunde_db: number | null
          ny_kunde_rang: number | null
          ordning_id: string | null
          regulering: number
          samlet_bonus: number | null
          user_id: string
        }
        Insert: {
          antal_animo?: number | null
          antal_rex?: number | null
          antal_wittenborg?: number | null
          db_bonus?: number | null
          db_grundlag?: number | null
          db_provision_pct?: number | null
          kilde?: string
          laast_af?: string | null
          laast_at?: string
          laast_note?: string | null
          loen_1561?: number
          loen_1563?: number
          maaned: string
          maskinbonus?: number | null
          maskiner?: Json
          ny_kunde_bonus?: number
          ny_kunde_db?: number | null
          ny_kunde_rang?: number | null
          ordning_id?: string | null
          regulering?: number
          samlet_bonus?: number | null
          user_id: string
        }
        Update: {
          antal_animo?: number | null
          antal_rex?: number | null
          antal_wittenborg?: number | null
          db_bonus?: number | null
          db_grundlag?: number | null
          db_provision_pct?: number | null
          kilde?: string
          laast_af?: string | null
          laast_at?: string
          laast_note?: string | null
          loen_1561?: number
          loen_1563?: number
          maaned?: string
          maskinbonus?: number | null
          maskiner?: Json
          ny_kunde_bonus?: number
          ny_kunde_db?: number | null
          ny_kunde_rang?: number | null
          ordning_id?: string | null
          regulering?: number
          samlet_bonus?: number | null
          user_id?: string
        }
        Relationships: []
      }
      bonus_laas_log: {
        Row: {
          begrundelse: string | null
          bruger: string | null
          handling: string
          id: string
          maaned: string
          tidspunkt: string
        }
        Insert: {
          begrundelse?: string | null
          bruger?: string | null
          handling: string
          id?: string
          maaned: string
          tidspunkt?: string
        }
        Update: {
          begrundelse?: string | null
          bruger?: string | null
          handling?: string
          id?: string
          maaned?: string
          tidspunkt?: string
        }
        Relationships: []
      }
      bonus_maskin_maaned: {
        Row: {
          detaljer: Json
          grundlag: Json
          maaned: string
          opdateret_at: string
          user_id: string
        }
        Insert: {
          detaljer?: Json
          grundlag?: Json
          maaned: string
          opdateret_at?: string
          user_id: string
        }
        Update: {
          detaljer?: Json
          grundlag?: Json
          maaned?: string
          opdateret_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bonus_maskin_refresh_ko: {
        Row: {
          maaned: string
          oprettet_at: string
          user_id: string
        }
        Insert: {
          maaned: string
          oprettet_at?: string
          user_id: string
        }
        Update: {
          maaned?: string
          oprettet_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bonus_maskin_vurdering: {
        Row: {
          aarsag: string | null
          besluttet_af: string | null
          besluttet_at: string
          godkendt: boolean | null
          id: string
          maaned: string
          ny_brugt: string | null
          serienr: string
          tjekliste: Json
          user_id: string
        }
        Insert: {
          aarsag?: string | null
          besluttet_af?: string | null
          besluttet_at?: string
          godkendt?: boolean | null
          id?: string
          maaned: string
          ny_brugt?: string | null
          serienr: string
          tjekliste?: Json
          user_id: string
        }
        Update: {
          aarsag?: string | null
          besluttet_af?: string | null
          besluttet_at?: string
          godkendt?: boolean | null
          id?: string
          maaned?: string
          ny_brugt?: string | null
          serienr?: string
          tjekliste?: Json
          user_id?: string
        }
        Relationships: []
      }
      bonus_maskin_vurdering_log: {
        Row: {
          aarsag: string | null
          godkendt: boolean | null
          handling: string
          id: number
          maaned: string
          ny_brugt: string | null
          serienr: string
          tjekliste: Json | null
          udfoert_af: string | null
          udfoert_at: string
          user_id: string
        }
        Insert: {
          aarsag?: string | null
          godkendt?: boolean | null
          handling: string
          id?: number
          maaned: string
          ny_brugt?: string | null
          serienr: string
          tjekliste?: Json | null
          udfoert_af?: string | null
          udfoert_at?: string
          user_id: string
        }
        Update: {
          aarsag?: string | null
          godkendt?: boolean | null
          handling?: string
          id?: number
          maaned?: string
          ny_brugt?: string | null
          serienr?: string
          tjekliste?: Json | null
          udfoert_af?: string | null
          udfoert_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bonus_ordning: {
        Row: {
          bonus_animo: number
          bonus_brugt: number
          bonus_espresso: number
          bonus_kalerm: number
          bonus_rex: number
          bonus_wittenborg: number
          created_at: string
          created_by: string | null
          db_bund: number | null
          db_fradrag: number | null
          db_offentlig: boolean
          db_privat: boolean
          db_provision_pct: number
          db_top: number | null
          flatrate: number | null
          gyldig_fra: string
          gyldig_til: string | null
          id: string
          maskin_brugt: boolean
          maskin_bund: number | null
          maskin_leje: boolean
          maskin_offentlig: boolean
          maskin_privat: boolean
          maskin_salg: boolean
          maskin_top: number | null
          ombytning_mdr: number
          overtagelse_mdr: number
          total_bund: number | null
          total_top: number | null
          user_id: string
        }
        Insert: {
          bonus_animo?: number
          bonus_brugt?: number
          bonus_espresso?: number
          bonus_kalerm?: number
          bonus_rex?: number
          bonus_wittenborg?: number
          created_at?: string
          created_by?: string | null
          db_bund?: number | null
          db_fradrag?: number | null
          db_offentlig?: boolean
          db_privat?: boolean
          db_provision_pct?: number
          db_top?: number | null
          flatrate?: number | null
          gyldig_fra: string
          gyldig_til?: string | null
          id?: string
          maskin_brugt?: boolean
          maskin_bund?: number | null
          maskin_leje?: boolean
          maskin_offentlig?: boolean
          maskin_privat?: boolean
          maskin_salg?: boolean
          maskin_top?: number | null
          ombytning_mdr?: number
          overtagelse_mdr?: number
          total_bund?: number | null
          total_top?: number | null
          user_id: string
        }
        Update: {
          bonus_animo?: number
          bonus_brugt?: number
          bonus_espresso?: number
          bonus_kalerm?: number
          bonus_rex?: number
          bonus_wittenborg?: number
          created_at?: string
          created_by?: string | null
          db_bund?: number | null
          db_fradrag?: number | null
          db_offentlig?: boolean
          db_privat?: boolean
          db_provision_pct?: number
          db_top?: number | null
          flatrate?: number | null
          gyldig_fra?: string
          gyldig_til?: string | null
          id?: string
          maskin_brugt?: boolean
          maskin_bund?: number | null
          maskin_leje?: boolean
          maskin_offentlig?: boolean
          maskin_privat?: boolean
          maskin_salg?: boolean
          maskin_top?: number | null
          ombytning_mdr?: number
          overtagelse_mdr?: number
          total_bund?: number | null
          total_top?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_ordning_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_ordning_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_regulering: {
        Row: {
          beloeb: number
          id: string
          kilde_maaned: string | null
          loenart: number
          oprettet_af: string | null
          oprettet_at: string
          tekst: string
          type: string
          udbetalingsmaaned: string
          user_id: string
        }
        Insert: {
          beloeb: number
          id?: string
          kilde_maaned?: string | null
          loenart: number
          oprettet_af?: string | null
          oprettet_at?: string
          tekst?: string
          type: string
          udbetalingsmaaned: string
          user_id: string
        }
        Update: {
          beloeb?: number
          id?: string
          kilde_maaned?: string | null
          loenart?: number
          oprettet_af?: string | null
          oprettet_at?: string
          tekst?: string
          type?: string
          udbetalingsmaaned?: string
          user_id?: string
        }
        Relationships: []
      }
      churn_dismissals: {
        Row: {
          company_id: string
          competitor_id: string | null
          created_at: string
          created_by: string
          expected_date: string | null
          id: string
          notes: string | null
          reason: string
          snooze_until: string | null
          snooze_user_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          competitor_id?: string | null
          created_at?: string
          created_by: string
          expected_date?: string | null
          id?: string
          notes?: string | null
          reason: string
          snooze_until?: string | null
          snooze_user_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          competitor_id?: string | null
          created_at?: string
          created_by?: string
          expected_date?: string | null
          id?: string
          notes?: string | null
          reason?: string
          snooze_until?: string | null
          snooze_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "churn_dismissals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "churn_dismissals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "churn_dismissals_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "churn_dismissals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "churn_dismissals_snooze_user_id_fkey"
            columns: ["snooze_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          afdeling_nr: number
          afloest_af_company_id: string | null
          assigned_to: string | null
          bi_branch_1_code: string | null
          bi_branch_2_code: string | null
          bi_branch_3_code: string | null
          binding_status: string | null
          city: string | null
          contact_person: string | null
          created_at: string
          created_in_visma: string | null
          customer_category: string | null
          customer_segment_1: string | null
          customer_segment_2: string | null
          customer_segment_3: string | null
          customer_type: Database["public"]["Enums"]["customer_type"]
          cvr: string | null
          cvr_p_enhed_count: number | null
          dublet_afvist_at: string | null
          ean_number: string | null
          email: string | null
          employees: number | null
          has_active_equipment: boolean
          id: string
          ikke_kontakt: boolean
          ikke_kontakt_af: string | null
          ikke_kontakt_at: string | null
          import_batch_date: string | null
          import_batch_id: string | null
          industry: string | null
          institution_type:
            | Database["public"]["Enums"]["institution_type"]
            | null
          is_public: boolean
          koeber_paa_company_id: string | null
          koeber_paa_konto: string | null
          kreditspaerret: boolean
          last_consumable_sales_date: string | null
          last_purchase_date: string | null
          last_sales_date: string | null
          main_branch_code: string | null
          main_branch_text: string | null
          municipality: string | null
          naeste_koeb_forventet: string | null
          name: string
          over_rytme: boolean
          parent_cvr: string | null
          phone: string | null
          rytme_interval_mdr: number | null
          rytme_koebsmaaneder: number | null
          source: string | null
          source_created_by: string | null
          source_updated_at: string | null
          sources: string[]
          turnover_12m: number | null
          visma_delivery_id: string | null
          visma_enhed: string | null
          visma_id: string | null
          visma_notes: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          afdeling_nr?: number
          afloest_af_company_id?: string | null
          assigned_to?: string | null
          bi_branch_1_code?: string | null
          bi_branch_2_code?: string | null
          bi_branch_3_code?: string | null
          binding_status?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          created_in_visma?: string | null
          customer_category?: string | null
          customer_segment_1?: string | null
          customer_segment_2?: string | null
          customer_segment_3?: string | null
          customer_type?: Database["public"]["Enums"]["customer_type"]
          cvr?: string | null
          cvr_p_enhed_count?: number | null
          dublet_afvist_at?: string | null
          ean_number?: string | null
          email?: string | null
          employees?: number | null
          has_active_equipment?: boolean
          id?: string
          ikke_kontakt?: boolean
          ikke_kontakt_af?: string | null
          ikke_kontakt_at?: string | null
          import_batch_date?: string | null
          import_batch_id?: string | null
          industry?: string | null
          institution_type?:
            | Database["public"]["Enums"]["institution_type"]
            | null
          is_public?: boolean
          koeber_paa_company_id?: string | null
          koeber_paa_konto?: string | null
          kreditspaerret?: boolean
          last_consumable_sales_date?: string | null
          last_purchase_date?: string | null
          last_sales_date?: string | null
          main_branch_code?: string | null
          main_branch_text?: string | null
          municipality?: string | null
          naeste_koeb_forventet?: string | null
          name: string
          over_rytme?: boolean
          parent_cvr?: string | null
          phone?: string | null
          rytme_interval_mdr?: number | null
          rytme_koebsmaaneder?: number | null
          source?: string | null
          source_created_by?: string | null
          source_updated_at?: string | null
          sources?: string[]
          turnover_12m?: number | null
          visma_delivery_id?: string | null
          visma_enhed?: string | null
          visma_id?: string | null
          visma_notes?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          afdeling_nr?: number
          afloest_af_company_id?: string | null
          assigned_to?: string | null
          bi_branch_1_code?: string | null
          bi_branch_2_code?: string | null
          bi_branch_3_code?: string | null
          binding_status?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          created_in_visma?: string | null
          customer_category?: string | null
          customer_segment_1?: string | null
          customer_segment_2?: string | null
          customer_segment_3?: string | null
          customer_type?: Database["public"]["Enums"]["customer_type"]
          cvr?: string | null
          cvr_p_enhed_count?: number | null
          dublet_afvist_at?: string | null
          ean_number?: string | null
          email?: string | null
          employees?: number | null
          has_active_equipment?: boolean
          id?: string
          ikke_kontakt?: boolean
          ikke_kontakt_af?: string | null
          ikke_kontakt_at?: string | null
          import_batch_date?: string | null
          import_batch_id?: string | null
          industry?: string | null
          institution_type?:
            | Database["public"]["Enums"]["institution_type"]
            | null
          is_public?: boolean
          koeber_paa_company_id?: string | null
          koeber_paa_konto?: string | null
          kreditspaerret?: boolean
          last_consumable_sales_date?: string | null
          last_purchase_date?: string | null
          last_sales_date?: string | null
          main_branch_code?: string | null
          main_branch_text?: string | null
          municipality?: string | null
          naeste_koeb_forventet?: string | null
          name?: string
          over_rytme?: boolean
          parent_cvr?: string | null
          phone?: string | null
          rytme_interval_mdr?: number | null
          rytme_koebsmaaneder?: number | null
          source?: string | null
          source_created_by?: string | null
          source_updated_at?: string | null
          sources?: string[]
          turnover_12m?: number | null
          visma_delivery_id?: string | null
          visma_enhed?: string | null
          visma_id?: string | null
          visma_notes?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
          {
            foreignKeyName: "companies_afloest_af_company_id_fkey"
            columns: ["afloest_af_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_afloest_af_company_id_fkey"
            columns: ["afloest_af_company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "companies_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      companies_saelger_backup: {
        Row: {
          assigned_to: string | null
          backup_dato: string
          company_id: string
          kreditspaerret: boolean | null
        }
        Insert: {
          assigned_to?: string | null
          backup_dato: string
          company_id: string
          kreditspaerret?: boolean | null
        }
        Update: {
          assigned_to?: string | null
          backup_dato?: string
          company_id?: string
          kreditspaerret?: boolean | null
        }
        Relationships: []
      }
      company_briefings: {
        Row: {
          briefing_text: string
          company_id: string
          created_at: string
          generated_by: string
          id: string
        }
        Insert: {
          briefing_text: string
          company_id: string
          created_at?: string
          generated_by: string
          id?: string
        }
        Update: {
          briefing_text?: string
          company_id?: string
          created_at?: string
          generated_by?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_briefings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_briefings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_briefings_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_documents: {
        Row: {
          company_id: string
          created_at: string
          document_type: string
          expires_at: string | null
          file_size_bytes: number | null
          filename: string
          id: string
          notes: string | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          company_id: string
          created_at?: string
          document_type?: string
          expires_at?: string | null
          file_size_bytes?: number | null
          filename: string
          id?: string
          notes?: string | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          company_id?: string
          created_at?: string
          document_type?: string
          expires_at?: string | null
          file_size_bytes?: number | null
          filename?: string
          id?: string
          notes?: string | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_mp_info: {
        Row: {
          afdeling_nr: number | null
          assigned_to: string | null
          company_id: string
          created_in_visma: string | null
          gkey: string
          gyldig: boolean
          kat: string | null
        }
        Insert: {
          afdeling_nr?: number | null
          assigned_to?: string | null
          company_id: string
          created_in_visma?: string | null
          gkey: string
          gyldig?: boolean
          kat?: string | null
        }
        Update: {
          afdeling_nr?: number | null
          assigned_to?: string | null
          company_id?: string
          created_in_visma?: string | null
          gkey?: string
          gyldig?: boolean
          kat?: string | null
        }
        Relationships: []
      }
      company_relation_suggestions: {
        Row: {
          created_at: string
          from_company_id: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          source_text: string | null
          status: Database["public"]["Enums"]["relation_suggestion_status"]
          to_company_id: string | null
          to_visma_id: string
        }
        Insert: {
          created_at?: string
          from_company_id: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_text?: string | null
          status?: Database["public"]["Enums"]["relation_suggestion_status"]
          to_company_id?: string | null
          to_visma_id: string
        }
        Update: {
          created_at?: string
          from_company_id?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_text?: string | null
          status?: Database["public"]["Enums"]["relation_suggestion_status"]
          to_company_id?: string | null
          to_visma_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_relation_suggestions_from_company_id_fkey"
            columns: ["from_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_relation_suggestions_from_company_id_fkey"
            columns: ["from_company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_relation_suggestions_to_company_id_fkey"
            columns: ["to_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_relation_suggestions_to_company_id_fkey"
            columns: ["to_company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
        ]
      }
      company_relations: {
        Row: {
          created_at: string
          created_by: string | null
          from_company_id: string
          id: string
          note: string | null
          relation_type: Database["public"]["Enums"]["company_relation_type"]
          to_company_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_company_id: string
          id?: string
          note?: string | null
          relation_type: Database["public"]["Enums"]["company_relation_type"]
          to_company_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_company_id?: string
          id?: string
          note?: string | null
          relation_type?: Database["public"]["Enums"]["company_relation_type"]
          to_company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_relations_from_company_id_fkey"
            columns: ["from_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_relations_from_company_id_fkey"
            columns: ["from_company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_relations_to_company_id_fkey"
            columns: ["to_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_relations_to_company_id_fkey"
            columns: ["to_company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
        ]
      }
      competitor_assignments: {
        Row: {
          afsluttet_dato: string | null
          company_id: string
          competitor_id: string
          contract_expires_at: string | null
          created_at: string
          id: string
          location_id: string | null
          notes: string | null
          registered_by: string
          start_dato: string
          updated_at: string
        }
        Insert: {
          afsluttet_dato?: string | null
          company_id: string
          competitor_id: string
          contract_expires_at?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          registered_by: string
          start_dato?: string
          updated_at?: string
        }
        Update: {
          afsluttet_dato?: string | null
          company_id?: string
          competitor_id?: string
          contract_expires_at?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          registered_by?: string
          start_dato?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "competitor_assignments_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_assignments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_assignments_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          city: string | null
          competitor_type: string | null
          created_at: string
          created_by: string | null
          employee_count: number | null
          equipment_brands: string[] | null
          frellsen_counter: string | null
          id: string
          identifying_question: string | null
          name: string
          notes: string | null
          notes_updated_at: string | null
          notes_updated_by: string | null
        }
        Insert: {
          city?: string | null
          competitor_type?: string | null
          created_at?: string
          created_by?: string | null
          employee_count?: number | null
          equipment_brands?: string[] | null
          frellsen_counter?: string | null
          id?: string
          identifying_question?: string | null
          name: string
          notes?: string | null
          notes_updated_at?: string | null
          notes_updated_by?: string | null
        }
        Update: {
          city?: string | null
          competitor_type?: string | null
          created_at?: string
          created_by?: string | null
          employee_count?: number | null
          equipment_brands?: string[] | null
          frellsen_counter?: string | null
          id?: string
          identifying_question?: string | null
          name?: string
          notes?: string | null
          notes_updated_at?: string | null
          notes_updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitors_notes_updated_by_fkey"
            columns: ["notes_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_list_assignments: {
        Row: {
          antal_forsoeg: number
          assigned_to: string | null
          company_id: string
          contact_list_id: string
          created_at: string
          id: string
          location_id: string | null
          next_action_note: string | null
          next_followup_date: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          status: Database["public"]["Enums"]["assignment_status"]
          status_aarsag: string | null
          updated_at: string
        }
        Insert: {
          antal_forsoeg?: number
          assigned_to?: string | null
          company_id: string
          contact_list_id: string
          created_at?: string
          id?: string
          location_id?: string | null
          next_action_note?: string | null
          next_followup_date?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          status?: Database["public"]["Enums"]["assignment_status"]
          status_aarsag?: string | null
          updated_at?: string
        }
        Update: {
          antal_forsoeg?: number
          assigned_to?: string | null
          company_id?: string
          contact_list_id?: string
          created_at?: string
          id?: string
          location_id?: string | null
          next_action_note?: string | null
          next_followup_date?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          status?: Database["public"]["Enums"]["assignment_status"]
          status_aarsag?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_list_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_list_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contact_list_assignments_contact_list_id_fkey"
            columns: ["contact_list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_list_assignments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_lists: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          moede_modtager: string
          moede_saelger_user_id: string | null
          name: string
          purpose: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          moede_modtager?: string
          moede_saelger_user_id?: string | null
          name: string
          purpose?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          moede_modtager?: string
          moede_saelger_user_id?: string | null
          name?: string
          purpose?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          company_id: string
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          kilde: Database["public"]["Enums"]["kontakt_kilde"]
          location_id: string | null
          name: string
          notes: string | null
          phone: string | null
          title: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          kilde?: Database["public"]["Enums"]["kontakt_kilde"]
          location_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          title?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          kilde?: Database["public"]["Enums"]["kontakt_kilde"]
          location_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contacts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      cvr_blocklist: {
        Row: {
          created_at: string
          cvr: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          cvr: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          cvr?: string
          reason?: string | null
        }
        Relationships: []
      }
      cvr_direktoer_job: {
        Row: {
          beskrivelse: string | null
          company_ids: string[]
          created_at: string
          created_by: string | null
          fejl: string | null
          fundet: number
          id: string
          naeste: number
          opdateret_at: string
          oprettet: number
          status: string
        }
        Insert: {
          beskrivelse?: string | null
          company_ids: string[]
          created_at?: string
          created_by?: string | null
          fejl?: string | null
          fundet?: number
          id?: string
          naeste?: number
          opdateret_at?: string
          oprettet?: number
          status?: string
        }
        Update: {
          beskrivelse?: string | null
          company_ids?: string[]
          created_at?: string
          created_by?: string | null
          fejl?: string | null
          fundet?: number
          id?: string
          naeste?: number
          opdateret_at?: string
          oprettet?: number
          status?: string
        }
        Relationships: []
      }
      cvr_enhed: {
        Row: {
          adresse: string | null
          ansatte: number | null
          branchekode: string | null
          branchetekst: string | null
          by: string | null
          cvr: string
          cvr_navn: string | null
          cvr_status: string | null
          fundet: boolean
          hentet_at: string
          kommune: string | null
          postnr: string | null
          virksomhedsform: string | null
        }
        Insert: {
          adresse?: string | null
          ansatte?: number | null
          branchekode?: string | null
          branchetekst?: string | null
          by?: string | null
          cvr: string
          cvr_navn?: string | null
          cvr_status?: string | null
          fundet?: boolean
          hentet_at?: string
          kommune?: string | null
          postnr?: string | null
          virksomhedsform?: string | null
        }
        Update: {
          adresse?: string | null
          ansatte?: number | null
          branchekode?: string | null
          branchetekst?: string | null
          by?: string | null
          cvr?: string
          cvr_navn?: string | null
          cvr_status?: string | null
          fundet?: boolean
          hentet_at?: string
          kommune?: string | null
          postnr?: string | null
          virksomhedsform?: string | null
        }
        Relationships: []
      }
      cvr_enrichment_jobs: {
        Row: {
          attempts: number
          campaign_id: string | null
          company_ids: string[]
          created_at: string
          enriched_count: number | null
          finished_at: string | null
          id: string
          last_error: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          campaign_id?: string | null
          company_ids: string[]
          created_at?: string
          enriched_count?: number | null
          finished_at?: string | null
          id?: string
          last_error?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          campaign_id?: string | null
          company_ids?: string[]
          created_at?: string
          enriched_count?: number | null
          finished_at?: string | null
          id?: string
          last_error?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      cvr_penhed_sync_jobs: {
        Row: {
          attempts: number
          created_at: string
          cvrs: string[]
          finished_at: string | null
          id: string
          last_error: string | null
          started_at: string | null
          status: string
          synced_count: number | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          cvrs: string[]
          finished_at?: string | null
          id?: string
          last_error?: string | null
          started_at?: string | null
          status?: string
          synced_count?: number | null
        }
        Update: {
          attempts?: number
          created_at?: string
          cvrs?: string[]
          finished_at?: string | null
          id?: string
          last_error?: string | null
          started_at?: string | null
          status?: string
          synced_count?: number | null
        }
        Relationships: []
      }
      cvr_penhed_sync_status: {
        Row: {
          antal_penheder: number | null
          created_at: string
          cvr: string
          last_error: string | null
          last_status: string | null
          last_synced_at: string | null
          prioritet_override_at: string | null
        }
        Insert: {
          antal_penheder?: number | null
          created_at?: string
          cvr: string
          last_error?: string | null
          last_status?: string | null
          last_synced_at?: string | null
          prioritet_override_at?: string | null
        }
        Update: {
          antal_penheder?: number | null
          created_at?: string
          cvr?: string
          last_error?: string | null
          last_status?: string | null
          last_synced_at?: string | null
          prioritet_override_at?: string | null
        }
        Relationships: []
      }
      cvr_penheder: {
        Row: {
          address: string | null
          ansatte_estimat: number | null
          ansatte_interval: string | null
          ansatte_praecis: number | null
          beskaeftigelse_periode: string | null
          branch_code: string | null
          city: string | null
          cvr: string
          is_active: boolean
          name: string | null
          p_number: string
          status: string | null
          synced_at: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          ansatte_estimat?: number | null
          ansatte_interval?: string | null
          ansatte_praecis?: number | null
          beskaeftigelse_periode?: string | null
          branch_code?: string | null
          city?: string | null
          cvr: string
          is_active?: boolean
          name?: string | null
          p_number: string
          status?: string | null
          synced_at?: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          ansatte_estimat?: number | null
          ansatte_interval?: string | null
          ansatte_praecis?: number | null
          beskaeftigelse_periode?: string | null
          branch_code?: string | null
          city?: string | null
          cvr?: string
          is_active?: boolean
          name?: string | null
          p_number?: string
          status?: string | null
          synced_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      distrikt_flade: {
        Row: {
          distrikt_id: string
          flade: number
          opdateret_af: string | null
          opdateret_at: string
        }
        Insert: {
          distrikt_id: string
          flade: number
          opdateret_af?: string | null
          opdateret_at?: string
        }
        Update: {
          distrikt_id?: string
          flade?: number
          opdateret_af?: string | null
          opdateret_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distrikt_flade_distrikt_id_fkey"
            columns: ["distrikt_id"]
            isOneToOne: false
            referencedRelation: "distrikter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distrikt_flade_flade_fkey"
            columns: ["flade"]
            isOneToOne: true
            referencedRelation: "postnummer_flader"
            referencedColumns: ["flade"]
          },
        ]
      }
      distrikt_flade_log: {
        Row: {
          flade: number
          fra_distrikt_id: string | null
          id: string
          til_distrikt_id: string | null
          udfoert_af: string | null
          udfoert_at: string
        }
        Insert: {
          flade: number
          fra_distrikt_id?: string | null
          id?: string
          til_distrikt_id?: string | null
          udfoert_af?: string | null
          udfoert_at?: string
        }
        Update: {
          flade?: number
          fra_distrikt_id?: string | null
          id?: string
          til_distrikt_id?: string | null
          udfoert_af?: string | null
          udfoert_at?: string
        }
        Relationships: []
      }
      distrikt_scenarie: {
        Row: {
          beskrivelse: string | null
          id: string
          navn: string
          opdateret_at: string
          oprettet_af: string | null
          oprettet_at: string
          status: string
        }
        Insert: {
          beskrivelse?: string | null
          id?: string
          navn: string
          opdateret_at?: string
          oprettet_af?: string | null
          oprettet_at?: string
          status?: string
        }
        Update: {
          beskrivelse?: string | null
          id?: string
          navn?: string
          opdateret_at?: string
          oprettet_af?: string | null
          oprettet_at?: string
          status?: string
        }
        Relationships: []
      }
      distrikter: {
        Row: {
          aktiv: boolean
          created_at: string
          daekkes_af_user_id: string | null
          farve: string
          id: string
          landsdel: string | null
          navn: string
          saelger_user_id: string | null
          sort: number
        }
        Insert: {
          aktiv?: boolean
          created_at?: string
          daekkes_af_user_id?: string | null
          farve?: string
          id?: string
          landsdel?: string | null
          navn: string
          saelger_user_id?: string | null
          sort?: number
        }
        Update: {
          aktiv?: boolean
          created_at?: string
          daekkes_af_user_id?: string | null
          farve?: string
          id?: string
          landsdel?: string | null
          navn?: string
          saelger_user_id?: string | null
          sort?: number
        }
        Relationships: []
      }
      fald_indstilling: {
        Row: {
          id: boolean
          min_fald_kr: number
          min_fald_pct: number
          opdateret_af: string | null
          opdateret_at: string
        }
        Insert: {
          id?: boolean
          min_fald_kr?: number
          min_fald_pct?: number
          opdateret_af?: string | null
          opdateret_at?: string
        }
        Update: {
          id?: boolean
          min_fald_kr?: number
          min_fald_pct?: number
          opdateret_af?: string | null
          opdateret_at?: string
        }
        Relationships: []
      }
      filter_templates: {
        Row: {
          created_at: string
          created_by: string
          filter_config: Json
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          filter_config?: Json
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          filter_config?: Json
          id?: string
          name?: string
        }
        Relationships: []
      }
      forbrug_signal_historik: {
        Row: {
          aarsag: string | null
          afdeling_nr: number | null
          afvigelse_pct: number | null
          akt_kg_pr_mdr: number | null
          akt_omsaetning: number | null
          base_kg_pr_mdr: number | null
          base_omsaetning: number | null
          company_id: string | null
          created_at: string
          enhed_id: string
          forventet_interval_mdr: number | null
          handling_paakraevet: boolean | null
          id: string
          klasse: string
          location_id: string | null
          mdr_siden_sidste_koeb: number | null
          niveau: string
          ordre_aendring_pct: number | null
          product_group_1: string
          sidste_koeb: string | null
          snapshot_periode: string
          stk_aendring_pct: number | null
          tabt_kg_pr_mdr: number | null
          tabt_kr_pr_mdr: number | null
        }
        Insert: {
          aarsag?: string | null
          afdeling_nr?: number | null
          afvigelse_pct?: number | null
          akt_kg_pr_mdr?: number | null
          akt_omsaetning?: number | null
          base_kg_pr_mdr?: number | null
          base_omsaetning?: number | null
          company_id?: string | null
          created_at?: string
          enhed_id: string
          forventet_interval_mdr?: number | null
          handling_paakraevet?: boolean | null
          id?: string
          klasse: string
          location_id?: string | null
          mdr_siden_sidste_koeb?: number | null
          niveau: string
          ordre_aendring_pct?: number | null
          product_group_1: string
          sidste_koeb?: string | null
          snapshot_periode: string
          stk_aendring_pct?: number | null
          tabt_kg_pr_mdr?: number | null
          tabt_kr_pr_mdr?: number | null
        }
        Update: {
          aarsag?: string | null
          afdeling_nr?: number | null
          afvigelse_pct?: number | null
          akt_kg_pr_mdr?: number | null
          akt_omsaetning?: number | null
          base_kg_pr_mdr?: number | null
          base_omsaetning?: number | null
          company_id?: string | null
          created_at?: string
          enhed_id?: string
          forventet_interval_mdr?: number | null
          handling_paakraevet?: boolean | null
          id?: string
          klasse?: string
          location_id?: string | null
          mdr_siden_sidste_koeb?: number | null
          niveau?: string
          ordre_aendring_pct?: number | null
          product_group_1?: string
          sidste_koeb?: string | null
          snapshot_periode?: string
          stk_aendring_pct?: number | null
          tabt_kg_pr_mdr?: number | null
          tabt_kr_pr_mdr?: number | null
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          company_count: number
          created_at: string
          created_by: string
          filename: string | null
          id: string
          item_count: number
          kind: string
          payload: Json | null
        }
        Insert: {
          company_count?: number
          created_at?: string
          created_by: string
          filename?: string | null
          id?: string
          item_count?: number
          kind?: string
          payload?: Json | null
        }
        Update: {
          company_count?: number
          created_at?: string
          created_by?: string
          filename?: string | null
          id?: string
          item_count?: number
          kind?: string
          payload?: Json | null
        }
        Relationships: []
      }
      import_log: {
        Row: {
          afviste: number
          afviste_detaljer: Json | null
          created_at: string
          created_by: string | null
          fejl: string | null
          filename: string | null
          id: string
          import_type: string
          kilde_id: string | null
          status: string
        }
        Insert: {
          afviste?: number
          afviste_detaljer?: Json | null
          created_at?: string
          created_by?: string | null
          fejl?: string | null
          filename?: string | null
          id?: string
          import_type: string
          kilde_id?: string | null
          status: string
        }
        Update: {
          afviste?: number
          afviste_detaljer?: Json | null
          created_at?: string
          created_by?: string | null
          fejl?: string | null
          filename?: string | null
          id?: string
          import_type?: string
          kilde_id?: string | null
          status?: string
        }
        Relationships: []
      }
      invoice_db_afstemning: {
        Row: {
          beloeb: number | null
          created_at: string
          db_linjer_efter: number | null
          db_linjer_foer: number | null
          db_summering: number | null
          id: string
          job_id: string
          periode_fra: string | null
          periode_til: string | null
          udfald: string
          visma_delivery_no: string
        }
        Insert: {
          beloeb?: number | null
          created_at?: string
          db_linjer_efter?: number | null
          db_linjer_foer?: number | null
          db_summering?: number | null
          id?: string
          job_id: string
          periode_fra?: string | null
          periode_til?: string | null
          udfald: string
          visma_delivery_no: string
        }
        Update: {
          beloeb?: number | null
          created_at?: string
          db_linjer_efter?: number | null
          db_linjer_foer?: number | null
          db_summering?: number | null
          id?: string
          job_id?: string
          periode_fra?: string | null
          periode_til?: string | null
          udfald?: string
          visma_delivery_no?: string
        }
        Relationships: []
      }
      invoice_import_jobs: {
        Row: {
          aggregate_month_idx: number
          aggregated_path: string | null
          attempts: number
          berorte_maaneder: Json
          created_at: string
          error_message: string | null
          file_path: string | null
          finished_at: string | null
          id: string
          last_error: string | null
          lines_afdelinger: number[] | null
          lines_batch_id: string | null
          lines_date_from: string | null
          lines_date_to: string | null
          lines_deleted: number
          locations_matched: number
          months_rebuilt: number
          payload: Json
          phase: string
          prune_month_idx: number
          saved_lines: number
          saved_monthly: number
          saved_top: number
          saved_top_monthly: number
          started_at: string | null
          status: string
          top_deleted: boolean
          total_lines: number
          total_monthly: number
          total_top: number
          total_top_monthly: number
          unmatched_delivery_nos: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          aggregate_month_idx?: number
          aggregated_path?: string | null
          attempts?: number
          berorte_maaneder?: Json
          created_at?: string
          error_message?: string | null
          file_path?: string | null
          finished_at?: string | null
          id?: string
          last_error?: string | null
          lines_afdelinger?: number[] | null
          lines_batch_id?: string | null
          lines_date_from?: string | null
          lines_date_to?: string | null
          lines_deleted?: number
          locations_matched?: number
          months_rebuilt?: number
          payload: Json
          phase?: string
          prune_month_idx?: number
          saved_lines?: number
          saved_monthly?: number
          saved_top?: number
          saved_top_monthly?: number
          started_at?: string | null
          status?: string
          top_deleted?: boolean
          total_lines?: number
          total_monthly?: number
          total_top?: number
          total_top_monthly?: number
          unmatched_delivery_nos?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          aggregate_month_idx?: number
          aggregated_path?: string | null
          attempts?: number
          berorte_maaneder?: Json
          created_at?: string
          error_message?: string | null
          file_path?: string | null
          finished_at?: string | null
          id?: string
          last_error?: string | null
          lines_afdelinger?: number[] | null
          lines_batch_id?: string | null
          lines_date_from?: string | null
          lines_date_to?: string | null
          lines_deleted?: number
          locations_matched?: number
          months_rebuilt?: number
          payload?: Json
          phase?: string
          prune_month_idx?: number
          saved_lines?: number
          saved_monthly?: number
          saved_top?: number
          saved_top_monthly?: number
          started_at?: string | null
          status?: string
          top_deleted?: boolean
          total_lines?: number
          total_monthly?: number
          total_top?: number
          total_top_monthly?: number
          unmatched_delivery_nos?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          afdeling_nr: number
          antal: number | null
          beloeb: number | null
          created_at: string
          db: number | null
          db_kilde: string
          dg: number | null
          enhedspris: number | null
          faktura_dato: string
          firma_nr: string | null
          id: number
          import_batch_id: string
          initialer: string | null
          kilde_afdeling_nr: number | null
          kostpris: number | null
          kunde_navn: string | null
          kundeprisgruppe_1: string | null
          kundeprisgruppe_2: string | null
          nettovaegt: number | null
          ordre_nr: string | null
          period: string | null
          varegruppe_1: string | null
          varegruppe_2: string | null
          varenr: string | null
          varetekst: string | null
          visma_delivery_no: string
        }
        Insert: {
          afdeling_nr: number
          antal?: number | null
          beloeb?: number | null
          created_at?: string
          db?: number | null
          db_kilde?: string
          dg?: number | null
          enhedspris?: number | null
          faktura_dato: string
          firma_nr?: string | null
          id?: number
          import_batch_id: string
          initialer?: string | null
          kilde_afdeling_nr?: number | null
          kostpris?: number | null
          kunde_navn?: string | null
          kundeprisgruppe_1?: string | null
          kundeprisgruppe_2?: string | null
          nettovaegt?: number | null
          ordre_nr?: string | null
          period?: string | null
          varegruppe_1?: string | null
          varegruppe_2?: string | null
          varenr?: string | null
          varetekst?: string | null
          visma_delivery_no: string
        }
        Update: {
          afdeling_nr?: number
          antal?: number | null
          beloeb?: number | null
          created_at?: string
          db?: number | null
          db_kilde?: string
          dg?: number | null
          enhedspris?: number | null
          faktura_dato?: string
          firma_nr?: string | null
          id?: number
          import_batch_id?: string
          initialer?: string | null
          kilde_afdeling_nr?: number | null
          kostpris?: number | null
          kunde_navn?: string | null
          kundeprisgruppe_1?: string | null
          kundeprisgruppe_2?: string | null
          nettovaegt?: number | null
          ordre_nr?: string | null
          period?: string | null
          varegruppe_1?: string | null
          varegruppe_2?: string | null
          varenr?: string | null
          varetekst?: string | null
          visma_delivery_no?: string
        }
        Relationships: []
      }
      kam_aftale: {
        Row: {
          aktiv: boolean
          id: string
          kam_ansvarlige: string[]
          koder: string[]
          kodetype: string
          kpg1: string[]
          kpg2: string[]
          kpg3: string[]
          navn: string
          omraade: Json | null
          opdateret_at: string
          oprettet_at: string
        }
        Insert: {
          aktiv?: boolean
          id?: string
          kam_ansvarlige?: string[]
          koder?: string[]
          kodetype?: string
          kpg1?: string[]
          kpg2?: string[]
          kpg3?: string[]
          navn: string
          omraade?: Json | null
          opdateret_at?: string
          oprettet_at?: string
        }
        Update: {
          aktiv?: boolean
          id?: string
          kam_ansvarlige?: string[]
          koder?: string[]
          kodetype?: string
          kpg1?: string[]
          kpg2?: string[]
          kpg3?: string[]
          navn?: string
          omraade?: Json | null
          opdateret_at?: string
          oprettet_at?: string
        }
        Relationships: []
      }
      katalog_indstilling: {
        Row: {
          forside_billede_url: string | null
          id: boolean
          katalog_url: string
          opdateret_af: string | null
          opdateret_at: string
        }
        Insert: {
          forside_billede_url?: string | null
          id?: boolean
          katalog_url: string
          opdateret_af?: string | null
          opdateret_at?: string
        }
        Update: {
          forside_billede_url?: string | null
          id?: boolean
          katalog_url?: string
          opdateret_af?: string | null
          opdateret_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "katalog_indstilling_opdateret_af_fkey"
            columns: ["opdateret_af"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      katalog_udsendelser: {
        Row: {
          aabnet_at: string | null
          activity_id: string | null
          company_id: string
          created_at: string
          id: string
          katalog_url: string
          location_id: string | null
          modtager_email: string
          modtager_navn: string | null
          sendt_af: string
          sendt_at: string | null
          status: string
        }
        Insert: {
          aabnet_at?: string | null
          activity_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          katalog_url: string
          location_id?: string | null
          modtager_email: string
          modtager_navn?: string | null
          sendt_af: string
          sendt_at?: string | null
          status?: string
        }
        Update: {
          aabnet_at?: string | null
          activity_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          katalog_url?: string
          location_id?: string | null
          modtager_email?: string
          modtager_navn?: string | null
          sendt_af?: string
          sendt_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "katalog_udsendelser_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "katalog_udsendelser_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "katalog_udsendelser_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "katalog_udsendelser_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "katalog_udsendelser_sendt_af_fkey"
            columns: ["sendt_af"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kontaktliste_opkald: {
        Row: {
          aarsag: string | null
          activity_id: string | null
          company_id: string
          contact_list_id: string
          created_at: string
          id: string
          moede_at: string | null
          moede_contact_id: string | null
          moede_saelger_user_id: string | null
          note: string | null
          ring_igen_at: string | null
          rolle: string | null
          udfald: string
          user_id: string
        }
        Insert: {
          aarsag?: string | null
          activity_id?: string | null
          company_id: string
          contact_list_id: string
          created_at?: string
          id?: string
          moede_at?: string | null
          moede_contact_id?: string | null
          moede_saelger_user_id?: string | null
          note?: string | null
          ring_igen_at?: string | null
          rolle?: string | null
          udfald: string
          user_id: string
        }
        Update: {
          aarsag?: string | null
          activity_id?: string | null
          company_id?: string
          contact_list_id?: string
          created_at?: string
          id?: string
          moede_at?: string | null
          moede_contact_id?: string | null
          moede_saelger_user_id?: string | null
          note?: string | null
          ring_igen_at?: string | null
          rolle?: string | null
          udfald?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kontaktliste_opkald_contact_list_id_fkey"
            columns: ["contact_list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      kontaktliste_ringer: {
        Row: {
          contact_list_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          contact_list_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          contact_list_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kontaktliste_ringer_contact_list_id_fkey"
            columns: ["contact_list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      kunde_stop: {
        Row: {
          aarsag: string
          company_id: string
          competitor_assignment_id: string | null
          fjernet_aarsag: string | null
          fjernet_af: string | null
          fjernet_at: string | null
          id: string
          location_id: string | null
          note: string | null
          oprettet_af: string | null
          oprettet_at: string
        }
        Insert: {
          aarsag: string
          company_id: string
          competitor_assignment_id?: string | null
          fjernet_aarsag?: string | null
          fjernet_af?: string | null
          fjernet_at?: string | null
          id?: string
          location_id?: string | null
          note?: string | null
          oprettet_af?: string | null
          oprettet_at?: string
        }
        Update: {
          aarsag?: string
          company_id?: string
          competitor_assignment_id?: string | null
          fjernet_aarsag?: string | null
          fjernet_af?: string | null
          fjernet_at?: string | null
          id?: string
          location_id?: string | null
          note?: string | null
          oprettet_af?: string | null
          oprettet_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kunde_stop_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kunde_stop_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "kunde_stop_competitor_assignment_id_fkey"
            columns: ["competitor_assignment_id"]
            isOneToOne: false
            referencedRelation: "competitor_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kunde_stop_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      kundeprisgruppe_sektor: {
        Row: {
          kode: string
          sektor: string
        }
        Insert: {
          kode: string
          sektor: string
        }
        Update: {
          kode?: string
          sektor?: string
        }
        Relationships: []
      }
      location_equipment_units: {
        Row: {
          afdeling_nr: number
          agreement_type: string | null
          created_at: string
          has_service_contract: boolean
          id: string
          import_batch_id: string | null
          is_filter: boolean
          is_free_loan: boolean
          location_id: string
          machine_type: string | null
          serial_no: string | null
          source: string
          sub_location: string | null
          udstyr_type: string
          varenr: string | null
        }
        Insert: {
          afdeling_nr?: number
          agreement_type?: string | null
          created_at?: string
          has_service_contract?: boolean
          id?: string
          import_batch_id?: string | null
          is_filter?: boolean
          is_free_loan?: boolean
          location_id: string
          machine_type?: string | null
          serial_no?: string | null
          source: string
          sub_location?: string | null
          udstyr_type?: string
          varenr?: string | null
        }
        Update: {
          afdeling_nr?: number
          agreement_type?: string | null
          created_at?: string
          has_service_contract?: boolean
          id?: string
          import_batch_id?: string | null
          is_filter?: boolean
          is_free_loan?: boolean
          location_id?: string
          machine_type?: string | null
          serial_no?: string | null
          source?: string
          sub_location?: string | null
          udstyr_type?: string
          varenr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_equipment_units_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
          {
            foreignKeyName: "location_equipment_units_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_mp_info: {
        Row: {
          afdeling_nr: number | null
          company_id: string
          foerste_ordre: string | null
          location_id: string
        }
        Insert: {
          afdeling_nr?: number | null
          company_id: string
          foerste_ordre?: string | null
          location_id: string
        }
        Update: {
          afdeling_nr?: number | null
          company_id?: string
          foerste_ordre?: string | null
          location_id?: string
        }
        Relationships: []
      }
      location_pnr_link: {
        Row: {
          afdeling_nr: number
          company_id: string | null
          id: string
          kilde: string
          location_id: string | null
          note: string | null
          oprettet_af: string | null
          oprettet_dato: string
          p_nummer: string
          relation_oprettet: boolean
          via_company_id: string | null
          visma_delivery_no: string | null
        }
        Insert: {
          afdeling_nr: number
          company_id?: string | null
          id?: string
          kilde: string
          location_id?: string | null
          note?: string | null
          oprettet_af?: string | null
          oprettet_dato?: string
          p_nummer: string
          relation_oprettet?: boolean
          via_company_id?: string | null
          visma_delivery_no?: string | null
        }
        Update: {
          afdeling_nr?: number
          company_id?: string | null
          id?: string
          kilde?: string
          location_id?: string | null
          note?: string | null
          oprettet_af?: string | null
          oprettet_dato?: string
          p_nummer?: string
          relation_oprettet?: boolean
          via_company_id?: string | null
          visma_delivery_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_pnr_link_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
          {
            foreignKeyName: "location_pnr_link_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_pnr_link_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "location_pnr_link_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_pnr_link_via_company_id_fkey"
            columns: ["via_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_pnr_link_via_company_id_fkey"
            columns: ["via_company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          afdeling_nr: number
          agreement_types: string | null
          aktoer_opdateret: string | null
          city: string | null
          company_id: string
          contact_person: string | null
          created_at: string
          customer_type: Database["public"]["Enums"]["customer_type"] | null
          email: string | null
          equipment_coffee_machines: number | null
          equipment_cooling: number | null
          equipment_filters: number | null
          equipment_frellsen_owned: number | null
          equipment_service_contracts: number | null
          equipment_summary: string | null
          equipment_updated_at: string | null
          er_hovedkonto: boolean
          has_free_loan: boolean | null
          has_lease_agreement: boolean | null
          i_aktoer: boolean
          id: string
          is_primary: boolean
          koeber_paa_location_id: string | null
          kreditspaerret: boolean
          naeste_koeb_forventet: string | null
          over_rytme: boolean
          phone: string | null
          region: string | null
          rytme_interval_mdr: number | null
          rytme_koebsmaaneder: number | null
          saelger_no: string | null
          saelger_user_id: string | null
          sales_signal: string | null
          sidste_forbrugskoeb: string | null
          visma_delivery_no: string | null
          visma_enhed: string | null
          zip: string | null
          zip_norm: string | null
        }
        Insert: {
          address?: string | null
          afdeling_nr?: number
          agreement_types?: string | null
          aktoer_opdateret?: string | null
          city?: string | null
          company_id: string
          contact_person?: string | null
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type"] | null
          email?: string | null
          equipment_coffee_machines?: number | null
          equipment_cooling?: number | null
          equipment_filters?: number | null
          equipment_frellsen_owned?: number | null
          equipment_service_contracts?: number | null
          equipment_summary?: string | null
          equipment_updated_at?: string | null
          er_hovedkonto?: boolean
          has_free_loan?: boolean | null
          has_lease_agreement?: boolean | null
          i_aktoer?: boolean
          id?: string
          is_primary?: boolean
          koeber_paa_location_id?: string | null
          kreditspaerret?: boolean
          naeste_koeb_forventet?: string | null
          over_rytme?: boolean
          phone?: string | null
          region?: string | null
          rytme_interval_mdr?: number | null
          rytme_koebsmaaneder?: number | null
          saelger_no?: string | null
          saelger_user_id?: string | null
          sales_signal?: string | null
          sidste_forbrugskoeb?: string | null
          visma_delivery_no?: string | null
          visma_enhed?: string | null
          zip?: string | null
          zip_norm?: string | null
        }
        Update: {
          address?: string | null
          afdeling_nr?: number
          agreement_types?: string | null
          aktoer_opdateret?: string | null
          city?: string | null
          company_id?: string
          contact_person?: string | null
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type"] | null
          email?: string | null
          equipment_coffee_machines?: number | null
          equipment_cooling?: number | null
          equipment_filters?: number | null
          equipment_frellsen_owned?: number | null
          equipment_service_contracts?: number | null
          equipment_summary?: string | null
          equipment_updated_at?: string | null
          er_hovedkonto?: boolean
          has_free_loan?: boolean | null
          has_lease_agreement?: boolean | null
          i_aktoer?: boolean
          id?: string
          is_primary?: boolean
          koeber_paa_location_id?: string | null
          kreditspaerret?: boolean
          naeste_koeb_forventet?: string | null
          over_rytme?: boolean
          phone?: string | null
          region?: string | null
          rytme_interval_mdr?: number | null
          rytme_koebsmaaneder?: number | null
          saelger_no?: string | null
          saelger_user_id?: string | null
          sales_signal?: string | null
          sidste_forbrugskoeb?: string | null
          visma_delivery_no?: string | null
          visma_enhed?: string | null
          zip?: string | null
          zip_norm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
          {
            foreignKeyName: "locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "locations_koeber_paa_location_id_fkey"
            columns: ["koeber_paa_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_saelger_user_id_fkey"
            columns: ["saelger_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_agreement_status: {
        Row: {
          afdeling_nr: number
          company_id: string
          created_at: string
          id: string
          location_id: string | null
          note: string | null
          serienr: string
          status: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          afdeling_nr?: number
          company_id: string
          created_at?: string
          id?: string
          location_id?: string | null
          note?: string | null
          serienr: string
          status: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          afdeling_nr?: number
          company_id?: string
          created_at?: string
          id?: string
          location_id?: string | null
          note?: string | null
          serienr?: string
          status?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_agreement_status_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
          {
            foreignKeyName: "machine_agreement_status_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_agreement_status_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "machine_agreement_status_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_agreement_status_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_enrichment: {
        Row: {
          afdeling_nr: number
          aftale_type: string | null
          beregnet_slutdato: string | null
          binding_ophor: string | null
          created_at: string
          data: Json | null
          handlingsdato: string | null
          handlingsdato_raw: string | null
          kilde: string
          kobt_dato: string | null
          last_seen_import: string | null
          lease_leje_dato: string | null
          record_status: string
          serienr: string
          taelleraflaesning: string | null
          udgaaet_dato: string | null
          updated_at: string
        }
        Insert: {
          afdeling_nr?: number
          aftale_type?: string | null
          beregnet_slutdato?: string | null
          binding_ophor?: string | null
          created_at?: string
          data?: Json | null
          handlingsdato?: string | null
          handlingsdato_raw?: string | null
          kilde?: string
          kobt_dato?: string | null
          last_seen_import?: string | null
          lease_leje_dato?: string | null
          record_status?: string
          serienr: string
          taelleraflaesning?: string | null
          udgaaet_dato?: string | null
          updated_at?: string
        }
        Update: {
          afdeling_nr?: number
          aftale_type?: string | null
          beregnet_slutdato?: string | null
          binding_ophor?: string | null
          created_at?: string
          data?: Json | null
          handlingsdato?: string | null
          handlingsdato_raw?: string | null
          kilde?: string
          kobt_dato?: string | null
          last_seen_import?: string | null
          lease_leje_dato?: string | null
          record_status?: string
          serienr?: string
          taelleraflaesning?: string | null
          udgaaet_dato?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_enrichment_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
        ]
      }
      machines: {
        Row: {
          adresselinje2: string | null
          aendret_dato: string | null
          afdeling_nr: number
          beskrivelse: string | null
          created_at: string
          data: Json | null
          dup_index: number
          fak_kundenr: string | null
          id: string
          kobt_dato: string | null
          last_seen_import: string | null
          lease_leje_dato: string | null
          lev_kundenr: string | null
          navn: string | null
          ordrenr: string | null
          record_status: string
          serienr: string | null
          status: string | null
          taellerstand: number | null
          udgaaet_dato: string | null
          udlanstype: string | null
          updated_at: string
          varenr: string | null
        }
        Insert: {
          adresselinje2?: string | null
          aendret_dato?: string | null
          afdeling_nr?: number
          beskrivelse?: string | null
          created_at?: string
          data?: Json | null
          dup_index?: number
          fak_kundenr?: string | null
          id: string
          kobt_dato?: string | null
          last_seen_import?: string | null
          lease_leje_dato?: string | null
          lev_kundenr?: string | null
          navn?: string | null
          ordrenr?: string | null
          record_status?: string
          serienr?: string | null
          status?: string | null
          taellerstand?: number | null
          udgaaet_dato?: string | null
          udlanstype?: string | null
          updated_at?: string
          varenr?: string | null
        }
        Update: {
          adresselinje2?: string | null
          aendret_dato?: string | null
          afdeling_nr?: number
          beskrivelse?: string | null
          created_at?: string
          data?: Json | null
          dup_index?: number
          fak_kundenr?: string | null
          id?: string
          kobt_dato?: string | null
          last_seen_import?: string | null
          lease_leje_dato?: string | null
          lev_kundenr?: string | null
          navn?: string | null
          ordrenr?: string | null
          record_status?: string
          serienr?: string | null
          status?: string | null
          taellerstand?: number | null
          udgaaet_dato?: string | null
          udlanstype?: string | null
          updated_at?: string
          varenr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "machines_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
        ]
      }
      maskin_haendelser: {
        Row: {
          aftale_type: string | null
          company_id: string | null
          id: number
          import_tid: string
          kobt_dato: string | null
          lease_leje_dato: string | null
          lev_kundenr: string | null
          maskin_type: string | null
          serienr: string
          taellerstand: number | null
        }
        Insert: {
          aftale_type?: string | null
          company_id?: string | null
          id?: number
          import_tid?: string
          kobt_dato?: string | null
          lease_leje_dato?: string | null
          lev_kundenr?: string | null
          maskin_type?: string | null
          serienr: string
          taellerstand?: number | null
        }
        Update: {
          aftale_type?: string | null
          company_id?: string | null
          id?: number
          import_tid?: string
          kobt_dato?: string | null
          lease_leje_dato?: string | null
          lev_kundenr?: string | null
          maskin_type?: string | null
          serienr?: string
          taellerstand?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "maskin_haendelser_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maskin_haendelser_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
        ]
      }
      maskine_placering: {
        Row: {
          kilde: string
          opdateret_af: string | null
          opdateret_at: string
          placering: string | null
          serienr: string
        }
        Insert: {
          kilde?: string
          opdateret_af?: string | null
          opdateret_at?: string
          placering?: string | null
          serienr: string
        }
        Update: {
          kilde?: string
          opdateret_af?: string | null
          opdateret_at?: string
          placering?: string | null
          serienr?: string
        }
        Relationships: []
      }
      maskine_placering_log: {
        Row: {
          gammel: string | null
          id: string
          kilde: string
          ny: string | null
          serienr: string
          udfoert_af: string | null
          udfoert_at: string
        }
        Insert: {
          gammel?: string | null
          id?: string
          kilde: string
          ny?: string | null
          serienr: string
          udfoert_af?: string | null
          udfoert_at?: string
        }
        Update: {
          gammel?: string | null
          id?: string
          kilde?: string
          ny?: string | null
          serienr?: string
          udfoert_af?: string | null
          udfoert_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          activity_id: string | null
          company_id: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          notification_type: string
          recipient_id: string
          sender_id: string
        }
        Insert: {
          activity_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          notification_type?: string
          recipient_id: string
          sender_id: string
        }
        Update: {
          activity_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          notification_type?: string
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      penhed_forslag_afvist: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          p_nummer: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          p_nummer: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          p_nummer?: string
        }
        Relationships: [
          {
            foreignKeyName: "penhed_forslag_afvist_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      penhed_handling_log: {
        Row: {
          begrundelse: string | null
          handling: string
          id: string
          location_id: string | null
          p_nummer: string
          udfoert_af: string
          udfoert_dato: string
        }
        Insert: {
          begrundelse?: string | null
          handling: string
          id?: string
          location_id?: string | null
          p_nummer: string
          udfoert_af?: string
          udfoert_dato?: string
        }
        Update: {
          begrundelse?: string | null
          handling?: string
          id?: string
          location_id?: string | null
          p_nummer?: string
          udfoert_af?: string
          udfoert_dato?: string
        }
        Relationships: [
          {
            foreignKeyName: "penhed_handling_log_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      penhed_ikke_relevant: {
        Row: {
          aarsag: string
          created_at: string
          created_by: string | null
          fritekst: string | null
          p_nummer: string
        }
        Insert: {
          aarsag: string
          created_at?: string
          created_by?: string | null
          fritekst?: string | null
          p_nummer: string
        }
        Update: {
          aarsag?: string
          created_at?: string
          created_by?: string | null
          fritekst?: string | null
          p_nummer?: string
        }
        Relationships: [
          {
            foreignKeyName: "penhed_ikke_relevant_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      postnummer_flade_map: {
        Row: {
          flade: number | null
          postnr: string
        }
        Insert: {
          flade?: number | null
          postnr: string
        }
        Update: {
          flade?: number | null
          postnr?: string
        }
        Relationships: [
          {
            foreignKeyName: "postnummer_flade_map_flade_fkey"
            columns: ["flade"]
            isOneToOne: false
            referencedRelation: "postnummer_flader"
            referencedColumns: ["flade"]
          },
        ]
      }
      postnummer_flader: {
        Row: {
          flade: number
          geom: Json | null
          landsdel: string | null
          lx: number | null
          ly: number | null
          navn: string | null
          postnumre: number[] | null
        }
        Insert: {
          flade: number
          geom?: Json | null
          landsdel?: string | null
          lx?: number | null
          ly?: number | null
          navn?: string | null
          postnumre?: number[] | null
        }
        Update: {
          flade?: number
          geom?: Json | null
          landsdel?: string | null
          lx?: number | null
          ly?: number | null
          navn?: string | null
          postnumre?: number[] | null
        }
        Relationships: []
      }
      postnummer_region: {
        Row: {
          created_at: string
          postnr_fra: number
          postnr_til: number
          region: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          postnr_fra: number
          postnr_til: number
          region: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          postnr_fra?: number
          postnr_til?: number
          region?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          beskrivelse: string | null
          billede_url: string | null
          bonusklasse: string | null
          bonusklasse_manuel: boolean
          created_at: string
          is_favorit: boolean
          is_tilbudsegnet: boolean
          kan_lejes: boolean
          kategori: string | null
          kategori_manuel: boolean
          kilde: string
          listepris: number | null
          produktprisgruppe_1: string | null
          produktprisgruppe_2: string | null
          produktprisgruppe_3: string | null
          record_status: string
          salgsbeskrivelse: string | null
          sort_order: number | null
          te_type: string | null
          te_type_manuel: boolean
          udlejningspris: number | null
          updated_at: string
          varenr: string
        }
        Insert: {
          beskrivelse?: string | null
          billede_url?: string | null
          bonusklasse?: string | null
          bonusklasse_manuel?: boolean
          created_at?: string
          is_favorit?: boolean
          is_tilbudsegnet?: boolean
          kan_lejes?: boolean
          kategori?: string | null
          kategori_manuel?: boolean
          kilde?: string
          listepris?: number | null
          produktprisgruppe_1?: string | null
          produktprisgruppe_2?: string | null
          produktprisgruppe_3?: string | null
          record_status?: string
          salgsbeskrivelse?: string | null
          sort_order?: number | null
          te_type?: string | null
          te_type_manuel?: boolean
          udlejningspris?: number | null
          updated_at?: string
          varenr: string
        }
        Update: {
          beskrivelse?: string | null
          billede_url?: string | null
          bonusklasse?: string | null
          bonusklasse_manuel?: boolean
          created_at?: string
          is_favorit?: boolean
          is_tilbudsegnet?: boolean
          kan_lejes?: boolean
          kategori?: string | null
          kategori_manuel?: boolean
          kilde?: string
          listepris?: number | null
          produktprisgruppe_1?: string | null
          produktprisgruppe_2?: string | null
          produktprisgruppe_3?: string | null
          record_status?: string
          salgsbeskrivelse?: string | null
          sort_order?: number | null
          te_type?: string | null
          te_type_manuel?: boolean
          udlejningspris?: number | null
          updated_at?: string
          varenr?: string
        }
        Relationships: []
      }
      produkt_underkategori: {
        Row: {
          created_at: string
          hovedkategori: string
          id: string
          label: string
          product_group_1: string
          produktprisgruppe_2: string | null
          sort: number
        }
        Insert: {
          created_at?: string
          hovedkategori: string
          id?: string
          label: string
          product_group_1: string
          produktprisgruppe_2?: string | null
          sort?: number
        }
        Update: {
          created_at?: string
          hovedkategori?: string
          id?: string
          label?: string
          product_group_1?: string
          produktprisgruppe_2?: string | null
          sort?: number
        }
        Relationships: []
      }
      produktgruppe_navn: {
        Row: {
          afdeling_nr: number
          created_at: string
          navn: string
          product_group_1: string
          updated_at: string
        }
        Insert: {
          afdeling_nr: number
          created_at?: string
          navn: string
          product_group_1: string
          updated_at?: string
        }
        Update: {
          afdeling_nr?: number
          created_at?: string
          navn?: string
          product_group_1?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produktgruppe_navn_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
        ]
      }
      produktgruppe_rolle: {
        Row: {
          created_at: string
          er_primaer: boolean
          indgaar_i_sortiment: boolean
          navn: string
          product_group_1: string
          rolle: string
        }
        Insert: {
          created_at?: string
          er_primaer?: boolean
          indgaar_i_sortiment?: boolean
          navn: string
          product_group_1: string
          rolle: string
        }
        Update: {
          created_at?: string
          er_primaer?: boolean
          indgaar_i_sortiment?: boolean
          navn?: string
          product_group_1?: string
          rolle?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          loennr: string | null
          maa_se_afdelingspotentiale: boolean
          maa_se_analyse: boolean
          maa_se_db: boolean
          primary_afdeling_nr: number | null
          region: string | null
          salesperson_no: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          is_active?: boolean
          loennr?: string | null
          maa_se_afdelingspotentiale?: boolean
          maa_se_analyse?: boolean
          maa_se_db?: boolean
          primary_afdeling_nr?: number | null
          region?: string | null
          salesperson_no?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          loennr?: string | null
          maa_se_afdelingspotentiale?: boolean
          maa_se_analyse?: boolean
          maa_se_db?: boolean
          primary_afdeling_nr?: number | null
          region?: string | null
          salesperson_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_primary_afdeling_nr_fkey"
            columns: ["primary_afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
        ]
      }
      quote_events: {
        Row: {
          at: string
          event: string
          id: string
          recipient_id: string
          user_agent: string | null
        }
        Insert: {
          at?: string
          event: string
          id?: string
          recipient_id: string
          user_agent?: string | null
        }
        Update: {
          at?: string
          event?: string
          id?: string
          recipient_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "quote_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_lines: {
        Row: {
          antal: number
          beskrivelse_snapshot: string | null
          created_at: string
          er_leje: boolean
          id: string
          line_type: string
          listepris_snapshot: number
          nettopris_enhed_snapshot: number | null
          nettopris_snapshot: number
          quote_id: string
          rabat_kr_snapshot: number
          rabat_pct_snapshot: number
          saerpris_kr_snapshot: number
          sort_order: number
          updated_at: string
          varenr: string
        }
        Insert: {
          antal?: number
          beskrivelse_snapshot?: string | null
          created_at?: string
          er_leje?: boolean
          id?: string
          line_type: string
          listepris_snapshot?: number
          nettopris_enhed_snapshot?: number | null
          nettopris_snapshot?: number
          quote_id: string
          rabat_kr_snapshot?: number
          rabat_pct_snapshot?: number
          saerpris_kr_snapshot?: number
          sort_order?: number
          updated_at?: string
          varenr: string
        }
        Update: {
          antal?: number
          beskrivelse_snapshot?: string | null
          created_at?: string
          er_leje?: boolean
          id?: string
          line_type?: string
          listepris_snapshot?: number
          nettopris_enhed_snapshot?: number | null
          nettopris_snapshot?: number
          quote_id?: string
          rabat_kr_snapshot?: number
          rabat_pct_snapshot?: number
          saerpris_kr_snapshot?: number
          sort_order?: number
          updated_at?: string
          varenr?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_lines_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_recipients: {
        Row: {
          antal_aabninger: number
          contact_id: string | null
          created_at: string
          downloadet_at: string | null
          email: string
          foerst_aabnet_at: string | null
          id: string
          navn: string
          quote_id: string
          sendt_at: string | null
          seneste_aabnet_at: string | null
          token: string
        }
        Insert: {
          antal_aabninger?: number
          contact_id?: string | null
          created_at?: string
          downloadet_at?: string | null
          email: string
          foerst_aabnet_at?: string | null
          id?: string
          navn: string
          quote_id: string
          sendt_at?: string | null
          seneste_aabnet_at?: string | null
          token?: string
        }
        Update: {
          antal_aabninger?: number
          contact_id?: string | null
          created_at?: string
          downloadet_at?: string | null
          email?: string
          foerst_aabnet_at?: string | null
          id?: string
          navn?: string
          quote_id?: string
          sendt_at?: string | null
          seneste_aabnet_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_recipients_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          delivery_location_id: string | null
          estimated_value: number | null
          expiry_date: string | null
          faste_pr_maaned: number | null
          forbrug_pr_maaned: number | null
          frozen_at: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          pdf_path: string | null
          pricing_mode: string
          public_token: string | null
          quote_number: string | null
          saelger_id: string | null
          sent_date: string | null
          status: Database["public"]["Enums"]["quote_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          delivery_location_id?: string | null
          estimated_value?: number | null
          expiry_date?: string | null
          faste_pr_maaned?: number | null
          forbrug_pr_maaned?: number | null
          frozen_at?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          pdf_path?: string | null
          pricing_mode?: string
          public_token?: string | null
          quote_number?: string | null
          saelger_id?: string | null
          sent_date?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          delivery_location_id?: string | null
          estimated_value?: number | null
          expiry_date?: string | null
          faste_pr_maaned?: number | null
          forbrug_pr_maaned?: number | null
          frozen_at?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          pdf_path?: string | null
          pricing_mode?: string
          public_token?: string | null
          quote_number?: string | null
          saelger_id?: string | null
          sent_date?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "quotes_delivery_location_id_fkey"
            columns: ["delivery_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "sales_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_saelger_id_fkey"
            columns: ["saelger_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_kunde_maaned: {
        Row: {
          afdeling_nr: number
          c_afd: number | null
          company_id: string
          contrib: number
          contrib_fg: number
          gyldig: boolean
          has_fg: boolean
          kat: string | null
          kg: number
          kg_c4: number
          koder: string[]
          last_inv_any: string | null
          last_inv_cons: string | null
          last_inv_fb: string | null
          period: string
          pos_any: boolean
          pos_c4: boolean
          pos_fg: boolean
          rev: number
          rev_c4: number
          rev_ex16: number
          rev_fg: number
          saelger: string | null
          saelger_noegle: string
        }
        Insert: {
          afdeling_nr: number
          c_afd?: number | null
          company_id: string
          contrib?: number
          contrib_fg?: number
          gyldig?: boolean
          has_fg?: boolean
          kat?: string | null
          kg?: number
          kg_c4?: number
          koder?: string[]
          last_inv_any?: string | null
          last_inv_cons?: string | null
          last_inv_fb?: string | null
          period: string
          pos_any?: boolean
          pos_c4?: boolean
          pos_fg?: boolean
          rev?: number
          rev_c4?: number
          rev_ex16?: number
          rev_fg?: number
          saelger?: string | null
          saelger_noegle?: string
        }
        Update: {
          afdeling_nr?: number
          c_afd?: number | null
          company_id?: string
          contrib?: number
          contrib_fg?: number
          gyldig?: boolean
          has_fg?: boolean
          kat?: string | null
          kg?: number
          kg_c4?: number
          koder?: string[]
          last_inv_any?: string | null
          last_inv_cons?: string | null
          last_inv_fb?: string | null
          period?: string
          pos_any?: boolean
          pos_c4?: boolean
          pos_fg?: boolean
          rev?: number
          rev_c4?: number
          rev_ex16?: number
          rev_fg?: number
          saelger?: string | null
          saelger_noegle?: string
        }
        Relationships: []
      }
      sales_monthly: {
        Row: {
          afdeling_nr: number
          company_id: string | null
          contribution: number
          id: string
          last_invoice_date: string | null
          location_id: string | null
          order_count: number
          period: string
          product_group_1: string
          quantity: number
          revenue: number
          updated_at: string
          visma_delivery_no: string
          weight_kg: number
        }
        Insert: {
          afdeling_nr?: number
          company_id?: string | null
          contribution?: number
          id?: string
          last_invoice_date?: string | null
          location_id?: string | null
          order_count?: number
          period: string
          product_group_1: string
          quantity?: number
          revenue?: number
          updated_at?: string
          visma_delivery_no: string
          weight_kg?: number
        }
        Update: {
          afdeling_nr?: number
          company_id?: string | null
          contribution?: number
          id?: string
          last_invoice_date?: string | null
          location_id?: string | null
          order_count?: number
          period?: string
          product_group_1?: string
          quantity?: number
          revenue?: number
          updated_at?: string
          visma_delivery_no?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_monthly_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
          {
            foreignKeyName: "sales_monthly_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_monthly_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "sales_monthly_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_monthly_products: {
        Row: {
          afdeling_nr: number
          contribution: number
          description: string | null
          id: string
          location_id: string | null
          period: string
          product_group_1: string | null
          quantity: number
          revenue: number
          updated_at: string
          varenr: string
          visma_delivery_no: string
          weight_kg: number
        }
        Insert: {
          afdeling_nr?: number
          contribution?: number
          description?: string | null
          id?: string
          location_id?: string | null
          period: string
          product_group_1?: string | null
          quantity?: number
          revenue?: number
          updated_at?: string
          varenr: string
          visma_delivery_no: string
          weight_kg?: number
        }
        Update: {
          afdeling_nr?: number
          contribution?: number
          description?: string | null
          id?: string
          location_id?: string | null
          period?: string
          product_group_1?: string | null
          quantity?: number
          revenue?: number
          updated_at?: string
          varenr?: string
          visma_delivery_no?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_monthly_products_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
          {
            foreignKeyName: "sales_monthly_products_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_monthly_products_rebuilt: {
        Row: {
          afdeling_nr: number
          contribution: number
          description: string | null
          id: string
          location_id: string | null
          period: string
          product_group_1: string | null
          quantity: number
          revenue: number
          updated_at: string
          varenr: string
          visma_delivery_no: string
          weight_kg: number
        }
        Insert: {
          afdeling_nr?: number
          contribution?: number
          description?: string | null
          id?: string
          location_id?: string | null
          period: string
          product_group_1?: string | null
          quantity?: number
          revenue?: number
          updated_at?: string
          varenr: string
          visma_delivery_no: string
          weight_kg?: number
        }
        Update: {
          afdeling_nr?: number
          contribution?: number
          description?: string | null
          id?: string
          location_id?: string | null
          period?: string
          product_group_1?: string | null
          quantity?: number
          revenue?: number
          updated_at?: string
          varenr?: string
          visma_delivery_no?: string
          weight_kg?: number
        }
        Relationships: []
      }
      sales_monthly_rebuilt: {
        Row: {
          afdeling_nr: number
          company_id: string | null
          contribution: number
          id: string
          last_invoice_date: string | null
          location_id: string | null
          order_count: number
          period: string
          product_group_1: string
          quantity: number
          revenue: number
          updated_at: string
          visma_delivery_no: string
          weight_kg: number
        }
        Insert: {
          afdeling_nr?: number
          company_id?: string | null
          contribution?: number
          id?: string
          last_invoice_date?: string | null
          location_id?: string | null
          order_count?: number
          period: string
          product_group_1: string
          quantity?: number
          revenue?: number
          updated_at?: string
          visma_delivery_no: string
          weight_kg?: number
        }
        Update: {
          afdeling_nr?: number
          company_id?: string | null
          contribution?: number
          id?: string
          last_invoice_date?: string | null
          location_id?: string | null
          order_count?: number
          period?: string
          product_group_1?: string
          quantity?: number
          revenue?: number
          updated_at?: string
          visma_delivery_no?: string
          weight_kg?: number
        }
        Relationships: []
      }
      sales_opportunities: {
        Row: {
          ansatte_estimat: number | null
          assigned_to: string | null
          company_id: string
          created_at: string
          created_by: string | null
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          kilde: string | null
          kontaktliste_opkald_id: string | null
          moede_at: string | null
          moede_udfald: Database["public"]["Enums"]["moede_udfald"] | null
          name: string
          next_action: string | null
          next_followup_date: string | null
          opportunity_type: string | null
          p_nummer: string | null
          probability: number | null
          quote_id: string | null
          status: Database["public"]["Enums"]["opportunity_status"]
          status_v2: Database["public"]["Enums"]["opportunity_status_v2"]
          tabt_aarsag: Database["public"]["Enums"]["tabt_aarsag"] | null
          updated_at: string
        }
        Insert: {
          ansatte_estimat?: number | null
          assigned_to?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          kilde?: string | null
          kontaktliste_opkald_id?: string | null
          moede_at?: string | null
          moede_udfald?: Database["public"]["Enums"]["moede_udfald"] | null
          name: string
          next_action?: string | null
          next_followup_date?: string | null
          opportunity_type?: string | null
          p_nummer?: string | null
          probability?: number | null
          quote_id?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"]
          status_v2?: Database["public"]["Enums"]["opportunity_status_v2"]
          tabt_aarsag?: Database["public"]["Enums"]["tabt_aarsag"] | null
          updated_at?: string
        }
        Update: {
          ansatte_estimat?: number | null
          assigned_to?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          kilde?: string | null
          kontaktliste_opkald_id?: string | null
          moede_at?: string | null
          moede_udfald?: Database["public"]["Enums"]["moede_udfald"] | null
          name?: string
          next_action?: string | null
          next_followup_date?: string | null
          opportunity_type?: string | null
          p_nummer?: string | null
          probability?: number | null
          quote_id?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"]
          status_v2?: Database["public"]["Enums"]["opportunity_status_v2"]
          tabt_aarsag?: Database["public"]["Enums"]["tabt_aarsag"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "salgsintelligens_mersalg"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "sales_opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_opportunities_kontaktliste_opkald_id_fkey"
            columns: ["kontaktliste_opkald_id"]
            isOneToOne: false
            referencedRelation: "kontaktliste_opkald"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_opportunities_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_top_products: {
        Row: {
          afdeling_nr: number
          contribution: number
          description: string | null
          id: string
          location_id: string | null
          product_group_1: string | null
          quantity: number
          revenue: number
          updated_at: string
          varenr: string
          visma_delivery_no: string
        }
        Insert: {
          afdeling_nr?: number
          contribution?: number
          description?: string | null
          id?: string
          location_id?: string | null
          product_group_1?: string | null
          quantity?: number
          revenue?: number
          updated_at?: string
          varenr: string
          visma_delivery_no: string
        }
        Update: {
          afdeling_nr?: number
          contribution?: number
          description?: string | null
          id?: string
          location_id?: string | null
          product_group_1?: string | null
          quantity?: number
          revenue?: number
          updated_at?: string
          varenr?: string
          visma_delivery_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_top_products_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
          {
            foreignKeyName: "sales_top_products_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      salgskort_indstilling: {
        Row: {
          id: number
          kam_kpg3: string[]
          opdateret_at: string
        }
        Insert: {
          id?: number
          kam_kpg3?: string[]
          opdateret_at?: string
        }
        Update: {
          id?: number
          kam_kpg3?: string[]
          opdateret_at?: string
        }
        Relationships: []
      }
      scenarie_distrikt: {
        Row: {
          daekkes_af_user_id: string | null
          farve: string
          id: string
          kilde_distrikt_id: string | null
          landsdel: string | null
          navn: string
          saelger_fiktiv_id: string | null
          saelger_user_id: string | null
          scenarie_id: string
          sort: number
        }
        Insert: {
          daekkes_af_user_id?: string | null
          farve?: string
          id?: string
          kilde_distrikt_id?: string | null
          landsdel?: string | null
          navn: string
          saelger_fiktiv_id?: string | null
          saelger_user_id?: string | null
          scenarie_id: string
          sort?: number
        }
        Update: {
          daekkes_af_user_id?: string | null
          farve?: string
          id?: string
          kilde_distrikt_id?: string | null
          landsdel?: string | null
          navn?: string
          saelger_fiktiv_id?: string | null
          saelger_user_id?: string | null
          scenarie_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "scenarie_distrikt_saelger_fiktiv_id_fkey"
            columns: ["saelger_fiktiv_id"]
            isOneToOne: false
            referencedRelation: "scenarie_saelger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenarie_distrikt_scenarie_id_fkey"
            columns: ["scenarie_id"]
            isOneToOne: false
            referencedRelation: "distrikt_scenarie"
            referencedColumns: ["id"]
          },
        ]
      }
      scenarie_flade: {
        Row: {
          distrikt_id: string
          flade: number
          scenarie_id: string
        }
        Insert: {
          distrikt_id: string
          flade: number
          scenarie_id: string
        }
        Update: {
          distrikt_id?: string
          flade?: number
          scenarie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenarie_flade_distrikt_id_fkey"
            columns: ["distrikt_id"]
            isOneToOne: false
            referencedRelation: "scenarie_distrikt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenarie_flade_flade_fkey"
            columns: ["flade"]
            isOneToOne: false
            referencedRelation: "postnummer_flader"
            referencedColumns: ["flade"]
          },
          {
            foreignKeyName: "scenarie_flade_scenarie_id_fkey"
            columns: ["scenarie_id"]
            isOneToOne: false
            referencedRelation: "distrikt_scenarie"
            referencedColumns: ["id"]
          },
        ]
      }
      scenarie_kam: {
        Row: {
          aktiv: boolean
          id: string
          kam_ansvarlige: string[]
          kam_fiktive: string[]
          kilde_kam_id: string | null
          koder: string[]
          kodetype: string
          kpg1: string[]
          kpg2: string[]
          kpg3: string[]
          navn: string
          ny_i_scenarie: boolean
          omraade: Json | null
          scenarie_id: string
        }
        Insert: {
          aktiv?: boolean
          id?: string
          kam_ansvarlige?: string[]
          kam_fiktive?: string[]
          kilde_kam_id?: string | null
          koder?: string[]
          kodetype?: string
          kpg1?: string[]
          kpg2?: string[]
          kpg3?: string[]
          navn: string
          ny_i_scenarie?: boolean
          omraade?: Json | null
          scenarie_id: string
        }
        Update: {
          aktiv?: boolean
          id?: string
          kam_ansvarlige?: string[]
          kam_fiktive?: string[]
          kilde_kam_id?: string | null
          koder?: string[]
          kodetype?: string
          kpg1?: string[]
          kpg2?: string[]
          kpg3?: string[]
          navn?: string
          ny_i_scenarie?: boolean
          omraade?: Json | null
          scenarie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenarie_kam_scenarie_id_fkey"
            columns: ["scenarie_id"]
            isOneToOne: false
            referencedRelation: "distrikt_scenarie"
            referencedColumns: ["id"]
          },
        ]
      }
      scenarie_regel: {
        Row: {
          aktiv: boolean
          betingelse: Json
          id: string
          oprettet_at: string
          saelger_fiktiv_id: string | null
          saelger_user_id: string | null
          scenarie_id: string
          sortering: number
          type: string
        }
        Insert: {
          aktiv?: boolean
          betingelse?: Json
          id?: string
          oprettet_at?: string
          saelger_fiktiv_id?: string | null
          saelger_user_id?: string | null
          scenarie_id: string
          sortering?: number
          type: string
        }
        Update: {
          aktiv?: boolean
          betingelse?: Json
          id?: string
          oprettet_at?: string
          saelger_fiktiv_id?: string | null
          saelger_user_id?: string | null
          scenarie_id?: string
          sortering?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenarie_regel_saelger_fiktiv_id_fkey"
            columns: ["saelger_fiktiv_id"]
            isOneToOne: false
            referencedRelation: "scenarie_saelger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenarie_regel_scenarie_id_fkey"
            columns: ["scenarie_id"]
            isOneToOne: false
            referencedRelation: "distrikt_scenarie"
            referencedColumns: ["id"]
          },
        ]
      }
      scenarie_saelger: {
        Row: {
          farve: string
          id: string
          navn: string
          oprettet_at: string
          profil_id: string | null
          scenarie_id: string
        }
        Insert: {
          farve?: string
          id?: string
          navn: string
          oprettet_at?: string
          profil_id?: string | null
          scenarie_id: string
        }
        Update: {
          farve?: string
          id?: string
          navn?: string
          oprettet_at?: string
          profil_id?: string | null
          scenarie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenarie_saelger_scenarie_id_fkey"
            columns: ["scenarie_id"]
            isOneToOne: false
            referencedRelation: "distrikt_scenarie"
            referencedColumns: ["id"]
          },
        ]
      }
      tmp_crm_nord: {
        Row: {
          afdeling_nr: number | null
          assigned_to: string | null
          cc: string | null
          city: string | null
          ct: string | null
          cvr: string | null
          has_active_equipment: boolean | null
          id: string | null
          last_consumable_sales_date: string | null
          last_sales_date: string | null
          name: string | null
          nn: string | null
          zip: string | null
        }
        Insert: {
          afdeling_nr?: number | null
          assigned_to?: string | null
          cc?: string | null
          city?: string | null
          ct?: string | null
          cvr?: string | null
          has_active_equipment?: boolean | null
          id?: string | null
          last_consumable_sales_date?: string | null
          last_sales_date?: string | null
          name?: string | null
          nn?: string | null
          zip?: string | null
        }
        Update: {
          afdeling_nr?: number | null
          assigned_to?: string | null
          cc?: string | null
          city?: string | null
          ct?: string | null
          cvr?: string | null
          has_active_equipment?: boolean | null
          id?: string | null
          last_consumable_sales_date?: string | null
          last_sales_date?: string | null
          name?: string | null
          nn?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      tmp_leads_nordjylland: {
        Row: {
          cvr: string | null
          navn: string | null
          postnr: string | null
        }
        Insert: {
          cvr?: string | null
          navn?: string | null
          postnr?: string | null
        }
        Update: {
          cvr?: string | null
          navn?: string | null
          postnr?: string | null
        }
        Relationships: []
      }
      udstyr_datafejl_tjek: {
        Row: {
          kommentar: string | null
          noegle: string
          tjekket_af: string
          tjekket_af_navn: string | null
          tjekket_at: string
          type: string
        }
        Insert: {
          kommentar?: string | null
          noegle: string
          tjekket_af?: string
          tjekket_af_navn?: string | null
          tjekket_at?: string
          type: string
        }
        Update: {
          kommentar?: string | null
          noegle?: string
          tjekket_af?: string
          tjekket_af_navn?: string | null
          tjekket_at?: string
          type?: string
        }
        Relationships: []
      }
      udstyr_indstilling: {
        Row: {
          noegle: string
          opdateret_at: string
          vaerdi: number
        }
        Insert: {
          noegle: string
          opdateret_at?: string
          vaerdi: number
        }
        Update: {
          noegle?: string
          opdateret_at?: string
          vaerdi?: number
        }
        Relationships: []
      }
      udstyr_leje_type_maaned: {
        Row: {
          leje: number
          lev: string
          maaned: string
          maskintype: string
        }
        Insert: {
          leje?: number
          lev: string
          maaned: string
          maskintype: string
        }
        Update: {
          leje?: number
          lev?: string
          maaned?: string
          maskintype?: string
        }
        Relationships: []
      }
      udstyr_lok_maaned: {
        Row: {
          aftale_kost: number
          belastning: number
          leje: number
          lev: string
          maaned: string
          montoer: number
          patroner: number
          reparation_kost: number
          reservedele: number
          service_ind: number
          varer_db: number
        }
        Insert: {
          aftale_kost?: number
          belastning?: number
          leje?: number
          lev: string
          maaned: string
          montoer?: number
          patroner?: number
          reparation_kost?: number
          reservedele?: number
          service_ind?: number
          varer_db?: number
        }
        Update: {
          aftale_kost?: number
          belastning?: number
          leje?: number
          lev?: string
          maaned?: string
          montoer?: number
          patroner?: number
          reparation_kost?: number
          reservedele?: number
          service_ind?: number
          varer_db?: number
        }
        Relationships: []
      }
      udstyr_refresh_ko: {
        Row: {
          maaned: string
          tilfoejet_at: string
        }
        Insert: {
          maaned: string
          tilfoejet_at?: string
        }
        Update: {
          maaned?: string
          tilfoejet_at?: string
        }
        Relationships: []
      }
      user_afdeling_access: {
        Row: {
          afdeling_nr: number
          user_id: string
        }
        Insert: {
          afdeling_nr: number
          user_id: string
        }
        Update: {
          afdeling_nr?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_afdeling_access_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      forbrug_baseline: {
        Row: {
          aarsag: string | null
          afvigelse_pct: number | null
          akt_aktive_mdr: number | null
          akt_kg: number | null
          akt_kg_pr_mdr: number | null
          akt_kg_pr_ordre: number | null
          akt_kg_raa: number | null
          akt_omsaetning: number | null
          akt_ordrer: number | null
          akt_ordrer_pr_mdr: number | null
          base_aktive_mdr: number | null
          base_kg: number | null
          base_kg_pr_mdr: number | null
          base_kg_pr_ordre: number | null
          base_mdr_i_vindue: number | null
          base_omsaetning: number | null
          base_ordrer: number | null
          base_ordrer_pr_mdr: number | null
          base_tidlig_aktive_mdr: number | null
          company_id: string | null
          enhed_id: string | null
          forventet_interval_mdr: number | null
          handling_paakraevet: boolean | null
          klasse: string | null
          location_id: string | null
          mdr_siden_sidste_koeb: number | null
          niveau: string | null
          ordre_aendring_pct: number | null
          product_group_1: string | null
          sidste_koeb: string | null
          stk_aendring_pct: number | null
          tabt_kg_pr_mdr: number | null
          tabt_kr_pr_mdr: number | null
        }
        Relationships: []
      }
      forbrug_signal_seneste: {
        Row: {
          aarsag: string | null
          afdeling_nr: number | null
          afvigelse_pct: number | null
          akt_kg_pr_mdr: number | null
          akt_omsaetning: number | null
          base_kg_pr_mdr: number | null
          base_omsaetning: number | null
          company_id: string | null
          created_at: string | null
          enhed_id: string | null
          forventet_interval_mdr: number | null
          handling_paakraevet: boolean | null
          id: string | null
          klasse: string | null
          location_id: string | null
          mdr_siden_sidste_koeb: number | null
          niveau: string | null
          ordre_aendring_pct: number | null
          product_group_1: string | null
          sidste_koeb: string | null
          snapshot_periode: string | null
          stk_aendring_pct: number | null
          tabt_kg_pr_mdr: number | null
          tabt_kr_pr_mdr: number | null
        }
        Insert: {
          aarsag?: string | null
          afdeling_nr?: number | null
          afvigelse_pct?: number | null
          akt_kg_pr_mdr?: number | null
          akt_omsaetning?: number | null
          base_kg_pr_mdr?: number | null
          base_omsaetning?: number | null
          company_id?: string | null
          created_at?: string | null
          enhed_id?: string | null
          forventet_interval_mdr?: number | null
          handling_paakraevet?: boolean | null
          id?: string | null
          klasse?: string | null
          location_id?: string | null
          mdr_siden_sidste_koeb?: number | null
          niveau?: string | null
          ordre_aendring_pct?: number | null
          product_group_1?: string | null
          sidste_koeb?: string | null
          snapshot_periode?: string | null
          stk_aendring_pct?: number | null
          tabt_kg_pr_mdr?: number | null
          tabt_kr_pr_mdr?: number | null
        }
        Update: {
          aarsag?: string | null
          afdeling_nr?: number | null
          afvigelse_pct?: number | null
          akt_kg_pr_mdr?: number | null
          akt_omsaetning?: number | null
          base_kg_pr_mdr?: number | null
          base_omsaetning?: number | null
          company_id?: string | null
          created_at?: string | null
          enhed_id?: string | null
          forventet_interval_mdr?: number | null
          handling_paakraevet?: boolean | null
          id?: string | null
          klasse?: string | null
          location_id?: string | null
          mdr_siden_sidste_koeb?: number | null
          niveau?: string | null
          ordre_aendring_pct?: number | null
          product_group_1?: string | null
          sidste_koeb?: string | null
          snapshot_periode?: string | null
          stk_aendring_pct?: number | null
          tabt_kg_pr_mdr?: number | null
          tabt_kr_pr_mdr?: number | null
        }
        Relationships: []
      }
      forbrug_signal_udvikling: {
        Row: {
          aarsag_nu: string | null
          aendring_tabt_kg: number | null
          afdeling_nr: number | null
          company_id: string | null
          enhed_id: string | null
          klasse_foer: string | null
          klasse_nu: string | null
          location_id: string | null
          niveau: string | null
          product_group_1: string | null
          retning: string | null
          snapshot_periode: string | null
          tabt_kg_foer: number | null
          tabt_kg_nu: number | null
          tabt_kr_foer: number | null
          tabt_kr_nu: number | null
        }
        Relationships: []
      }
      forbrug_signal_virksomhed: {
        Row: {
          aarsag_primaer: string | null
          afdeling_nr: number | null
          afvigelse_pct_primaer: number | null
          akt_kg_primaer: number | null
          assigned_to: string | null
          base_kg_primaer: number | null
          company_id: string | null
          forventet_interval_mdr_primaer: number | null
          grupper_i_alt: number | null
          grupper_i_fald: number | null
          handling_paakraevet: boolean | null
          klasse_primaer: string | null
          mdr_siden_sidste_koeb_primaer: number | null
          sidste_koeb_primaer: string | null
          tabt_kg_pr_mdr: number | null
          tabt_kr_pr_mdr: number | null
          vaerste_score: number | null
        }
        Relationships: []
      }
      sales_period_completeness: {
        Row: {
          er_komplet: boolean | null
          kg: number | null
          lokationer: number | null
          lokationer_sidste_aar: number | null
          median_lokationer: number | null
          pct_af_median: number | null
          period: string | null
        }
        Relationships: []
      }
      sales_season_index: {
        Row: {
          komplette_maaneder_i_alt: number | null
          maaned: number | null
          maaneder_i_grundlag: number | null
          product_group_1: string | null
          saeson_indeks: number | null
        }
        Relationships: []
      }
      salgsintelligens_mersalg: {
        Row: {
          afdeling_nr: number | null
          ansatte_ikke_daekket: number | null
          ansatte_total: number | null
          antal_kundenumre: number | null
          assigned_to: string | null
          city: string | null
          company_id: string | null
          cvr: string | null
          daekket: number | null
          max_ansatte_ikke_daekket: number | null
          name: string | null
          offentlig: boolean | null
          penheder_total: number | null
          potential: number | null
          uden_tal_ikke_daekket: number | null
          uden_tal_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
        ]
      }
      salgsintelligens_penhed_status: {
        Row: {
          address: string | null
          afdeling_nr: number | null
          ansatte_estimat: number | null
          ansatte_interval: string | null
          ansatte_praecis: number | null
          city: string | null
          cvr: string | null
          link_kilde: string | null
          link_location_id: string | null
          link_visma_delivery_no: string | null
          match_status: string | null
          p_number: string | null
          penhed_navn: string | null
          zip: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_afdeling_nr_fkey"
            columns: ["afdeling_nr"]
            isOneToOne: false
            referencedRelation: "afdeling"
            referencedColumns: ["afdeling_nr"]
          },
        ]
      }
      sortiment_penetration: {
        Row: {
          customer_segment_1: string | null
          kunder_i_alt: number | null
          kunder_med_gruppen: number | null
          pct: number | null
          product_group_1: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _bonus_laas_saelger: {
        Args: {
          _admin: string
          _maaned: string
          _note?: string
          _saelger: string
        }
        Returns: undefined
      }
      _bonus_maskin_afsluttet_maaned: { Args: never; Returns: undefined }
      _bonus_maskin_beregn: {
        Args: { _fra: string; _saelger: string; _til: string }
        Returns: {
          aarsag: string
          antal: number
          beloeb: number
          bonusklasse: string
          brugt: boolean
          brugt_kilde: string
          by: string
          company_id: string
          faktura_dato: string
          forgaenger_dato: string
          forgaenger_serienr: string
          godkendt: boolean
          kategori: string
          kilde: string
          lev_kundenr: string
          maaned: string
          maerke: string
          model: string
          navn: string
          serienr: string
          status: string
          udeladt: boolean
          vurdering: string
        }[]
      }
      _bonus_maskin_refresh: {
        Args: { _maaned: string; _saelger: string }
        Returns: undefined
      }
      _distrikt_saelger: {
        Args: { _postnr: string }
        Returns: {
          distrikt_id: string
          distrikt_navn: string
          saelger_user_id: string
        }[]
      }
      _import_type_label: { Args: { _t: string }; Returns: string }
      _maa_se_kontosalg: { Args: { _company_id: string }; Returns: boolean }
      _maalepunkt_db_detaljer_raw: {
        Args: {
          _afdeling_nr?: number
          _fra: string
          _kategori: string
          _maaned?: string
          _saelger: string
          _til: string
        }
        Returns: {
          by: string
          company_id: string
          db: number
          navn: string
          omsaetning: number
        }[]
      }
      _map_kategori_from_pg2: { Args: { _pg2: string }; Returns: string }
      _remap_omraade: { Args: { m: Json; o: Json }; Returns: Json }
      _skm_refresh_keys: { Args: never; Returns: undefined }
      _status_rang: { Args: { _t: string }; Returns: number }
      _udfald_tekst: {
        Args: { _aarsag: string; _note: string; _udfald: string }
        Returns: string
      }
      addr_base: { Args: { _addr: string }; Returns: string }
      addr_husnr: { Args: { _addr: string }; Returns: string }
      addr_n_del: { Args: { _addr: string }; Returns: string[] }
      addr_n_husnr: { Args: { _addr: string }; Returns: string }
      addr_n_vej: { Args: { _addr: string }; Returns: string }
      addr_vej: { Args: { _addr: string }; Returns: string }
      admin_salgskort_lokationer: {
        Args: never
        Returns: {
          afdeling_nr: number
          agreement_types: string
          ansatte: number
          ansatte_kilde: string
          company_id: string
          customer_segment_1: string
          customer_segment_2: string
          customer_segment_3: string
          customer_type: string
          db_12m: number
          location_id: string
          omsaetning_12m: number
          saelger_navn: string
          saelger_user_id: string
          salesperson_no: string
          virksomhedsnavn: string
          zip_norm: string
        }[]
      }
      aktive_saelgere: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
      aktoer_anvend_saelgere: {
        Args: { _batch: string; _fuldt_udtraek?: boolean }
        Returns: Json
      }
      analyse_filtre: {
        Args: { _afdeling_nr: number; _fra: string; _til: string }
        Returns: Json
      }
      analyse_pivot: {
        Args: {
          _afdeling_nr: number
          _fra: string
          _kg_gruppe?: string
          _kundeprisgrupper?: string[]
          _limit?: number
          _offset?: number
          _opdel: string
          _regioner?: string[]
          _saelger_ids?: string[]
          _til: string
          _varegrupper?: string[]
        }
        Returns: {
          antal_kunder: number
          db: number
          kg: number
          navn: string
          noegle: string
          omsaetning: number
          stk: number
          total_db: number
          total_grupper: number
          total_kg: number
          total_kunder: number
          total_omsaetning: number
          total_stk: number
        }[]
      }
      auto_link_penheder: { Args: { _cvrs?: string[] }; Returns: number }
      bonus_afregning_saelgere: {
        Args: { _maaned: string }
        Returns: {
          flatrate: number
          loennr: string
          navn: string
          user_id: string
        }[]
      }
      bonus_db_detaljer: {
        Args: { _fra: string; _saelger: string; _til: string }
        Returns: {
          by: string
          company_id: string
          db: number
          kategori: string
          navn: string
          omsaetning: number
        }[]
      }
      bonus_historik_genetabler: {
        Args: { _maaned: string; _user_id: string }
        Returns: undefined
      }
      bonus_laas_afslut: {
        Args: { _maaned: string; _note?: string }
        Returns: undefined
      }
      bonus_laas_op: {
        Args: { _begrundelse: string; _maaned: string }
        Returns: undefined
      }
      bonus_laas_start: { Args: { _maaned: string }; Returns: string[] }
      bonus_maskin_advarsler: {
        Args: { _maaned: string }
        Returns: {
          navn: string
          til_vurdering: number
          uklassificeret: number
          user_id: string
        }[]
      }
      bonus_maskin_afregning: {
        Args: { _maaned: string }
        Returns: {
          navn: string
          raekker: Json
          user_id: string
        }[]
      }
      bonus_maskin_detaljer: {
        Args: { _fra: string; _saelger: string; _til: string }
        Returns: {
          aarsag: string
          antal: number
          beloeb: number
          bonusklasse: string
          brugt: boolean
          brugt_kilde: string
          by: string
          company_id: string
          faktura_dato: string
          forgaenger_dato: string
          forgaenger_serienr: string
          godkendt: boolean
          kilde: string
          maaned: string
          maerke: string
          model: string
          navn: string
          sats: number
          serienr: string
          status: string
          udeladt: boolean
          vurdering: string
        }[]
      }
      bonus_maskin_genberegn: { Args: never; Returns: number }
      bonus_maskin_grundlag: {
        Args: { _fra: string; _saelger: string; _til: string }
        Returns: {
          aarsag: string
          antal: number
          beloeb: number
          bonusklasse: string
          brugt: boolean
          brugt_kilde: string
          by: string
          company_id: string
          faktura_dato: string
          forgaenger_dato: string
          forgaenger_serienr: string
          godkendt: boolean
          kategori: string
          kilde: string
          lev_kundenr: string
          maaned: string
          maerke: string
          model: string
          navn: string
          serienr: string
          status: string
          udeladt: boolean
          vurdering: string
        }[]
      }
      bonus_maskin_grundlag_faktura: {
        Args: { _fra: string; _saelger: string; _til: string }
        Returns: {
          antal: number
          beloeb: number
          brugt: boolean
          by: string
          company_id: string
          faktura_dato: string
          kategori: string
          kilde: string
          maaned: string
          maerke: string
          model: string
          navn: string
        }[]
      }
      bonus_maskin_opdater_ko: { Args: { _maks?: number }; Returns: number }
      bonus_nykunde_detaljer: {
        Args: { _maaned: string; _saelger: string }
        Returns: {
          by: string
          company_id: string
          db: number
          navn: string
          omsaetning: number
        }[]
      }
      bonus_nykunde_rangliste: {
        Args: { _maaned: string }
        Returns: {
          beloeb: number
          db: number
          navn: string
          rang: number
          saelger: string
        }[]
      }
      bonus_pr_maaned: {
        Args: { _fra: string; _saelger: string; _til: string }
        Returns: {
          antal_animo: number
          antal_brugt: number
          antal_espresso: number
          antal_kalerm: number
          antal_rex: number
          antal_wittenborg: number
          db_bonus: number
          db_grundlag: number
          db_provision_pct: number
          maaned: string
          maskinbonus: number
          ny_kunde_bonus: number
          ny_kunde_db: number
          ny_kunde_rang: number
          ordning_id: string
          samlet_bonus: number
        }[]
      }
      can_access_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      classify_te_types: { Args: never; Returns: number }
      company_group_monthly: {
        Args: { _company_id: string }
        Returns: {
          contribution: number
          last_invoice_date: string
          order_count: number
          period: string
          product_group_1: string
          quantity: number
          revenue: number
          weight_kg: number
        }[]
      }
      company_sales_summary: {
        Args: { _company_ids: string[] }
        Returns: {
          company_id: string
          last_purchase: string
          revenue_12m: number
        }[]
      }
      company_sortiment_bredde: {
        Args: { _company_id: string }
        Returns: {
          antal_forbrug_foer: number
          antal_forbrug_nu: number
          antal_maskine_foer: number
          antal_maskine_nu: number
          varelinje_start: string
        }[]
      }
      compare_sales_aggregates: {
        Args: { _from: string; _to: string }
        Returns: {
          afdeling_nr: number
          kilde: string
          maaned: string
          monthly_kg: number
          monthly_revenue: number
          monthly_rows: number
          product_revenue: number
          product_rows: number
        }[]
      }
      create_quote_draft: {
        Args: {
          _company_id: string
          _delivery_location_id?: string
          _pricing_mode?: string
        }
        Returns: string
      }
      cvr_enhed_til_konti: { Args: { _cvrs: string[] }; Returns: number }
      cvr_findes_i_crm: {
        Args: { cvr_rows: Json }
        Returns: {
          company_id: string
          company_name: string
          cvr: string
          ikke_kontakt: boolean
          kundenr: string
          match_type: string
        }[]
      }
      cvr_gruppe_konti: {
        Args: { _cvr: string }
        Returns: {
          address: string
          city: string
          company_id: string
          customer_type: string
          maa_se_salg: boolean
          name: string
          oms_12m: number
          saelger_navn: string
          visma_id: string
          zip: string
        }[]
      }
      cvr_grupper: {
        Args: never
        Returns: {
          aktive: number
          antal_konti: number
          bedste_status: string
          cvr: string
          cvr_navn: string
          cvr_status: string
          oms_12m: number
        }[]
      }
      cvr_match_crm: {
        Args: { cvr_rows: Json }
        Returns: {
          company_id: string
          company_name: string
          cvr: string
          ikke_kontakt: boolean
          kundenr: string
          match_type: string
          score: number
          sikker: boolean
        }[]
      }
      cvr_norm: { Args: { _cvr: string }; Returns: string }
      cvr_penhed_oversigt: {
        Args: { _afdeling_nr: number; _cvr: string }
        Returns: {
          address: string
          ansatte: number
          ansatte_interval: string
          city: string
          company_id: string
          company_name: string
          customer_type: string
          location_id: string
          note: string
          oms_12m: number
          p_number: string
          saelger_navn: string
          status: string
          via_company_id: string
          via_company_name: string
          visma_delivery_no: string
          zip: string
        }[]
      }
      cvr_til_opdatering: { Args: { _n: number }; Returns: string[] }
      derive_agreement_type: {
        Args: { _name: string }
        Returns: Database["public"]["Enums"]["agreement_type"]
      }
      derive_te_type: { Args: { _beskrivelse: string }; Returns: string }
      distrikt_oversigt: {
        Args: never
        Returns: {
          daekkes_af_navn: string
          daekkes_af_user_id: string
          farve: string
          flader: number
          id: string
          navn: string
          postnumre: number
          saelger_navn: string
          saelger_user_id: string
          sort: number
        }[]
      }
      distrikt_postnumre: {
        Args: { _distrikt_ids: string[] }
        Returns: number[]
      }
      distrikt_saelger_for_postnumre: {
        Args: { _postnumre: string[] }
        Returns: {
          distrikt_id: string
          distrikt_navn: string
          postnr: string
          saelger_navn: string
          saelger_user_id: string
        }[]
      }
      distrikt_saelger_for_virksomheder: {
        Args: { _company_ids: string[] }
        Returns: {
          company_id: string
          saelger_user_id: string
        }[]
      }
      dublet_kandidater: {
        Args: never
        Returns: {
          alive_address: string
          alive_afdeling_nr: number
          alive_created_in_visma: string
          alive_id: string
          alive_last_varekoeb: string
          alive_name: string
          alive_turnover_12m: number
          alive_visma_enhed: string
          alive_visma_id: string
          alive_zip: string
          cvr: string
          dead_address: string
          dead_afdeling_nr: number
          dead_afloest_af_company_id: string
          dead_afvist_at: string
          dead_binding_status: string
          dead_created_in_visma: string
          dead_id: string
          dead_name: string
          dead_visma_enhed: string
          dead_visma_id: string
          dead_zip: string
          lighed: number
          samme_adresse: boolean
          samme_postnr: boolean
        }[]
      }
      dublet_navn_norm: { Args: { _name: string }; Returns: string }
      er_telemarketing: { Args: never; Returns: boolean }
      faktura_uden_kunde: {
        Args: never
        Returns: {
          antal: number
          beloeb: number
          seneste_beloeb: number
        }[]
      }
      faktura_uden_kunde_linjer: {
        Args: never
        Returns: {
          afdeling_nr: number
          beloeb: number
          faktura_dato: string
          kunde_navn: string
          visma_delivery_no: string
        }[]
      }
      get_public_quote: { Args: { _token: string }; Returns: Json }
      get_quote_floor_discount: {
        Args: { p_company_id: string; p_varenr: string }
        Returns: {
          er_saerpris: boolean
          kilde: string
          rabat_kr: number
          rabat_pct: number
          saerpris_kr: number
        }[]
      }
      get_user_region: { Args: { _user_id: string }; Returns: string }
      gruppe_navn: {
        Args: { _afdeling_nr: number; _group: string }
        Returns: string
      }
      har_afdelingspotentiale: { Args: { _uid: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_maskine_placering: {
        Args: { _placering: string; _serienr: string }
        Returns: undefined
      }
      import_maskine_placeringer: { Args: { _rows: Json }; Returns: number }
      import_status: {
        Args: never
        Returns: {
          fejl_at: string
          fejl_tekst: string
          import_type: string
          ok_afviste: number
          ok_at: string
          ok_fil: string
          ok_navn: string
          seneste_data: string
        }[]
      }
      import_visma_product_master: { Args: { _data: Json }; Returns: Json }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_consumable_group: { Args: { _group: string }; Returns: boolean }
      is_offentlig_kunde: {
        Args: {
          _institution_type: Database["public"]["Enums"]["institution_type"]
          _is_public: boolean
          _main_branch_code: string
          _name: string
        }
        Returns: boolean
      }
      katalog_afslut: {
        Args: { _afdeling_nr?: number; _id: string }
        Returns: string
      }
      katalog_foerste_klik: { Args: { _id: string }; Returns: string }
      konto_oms_12m: {
        Args: { _ids: string[] }
        Returns: {
          company_id: string
          oms_12m: number
        }[]
      }
      kunde_db_rang: {
        Args: { _company: string }
        Returns: {
          antal: number
          db: number
          db_foer: number
          egen: boolean
          rang: number
          saelger: string
          saelger_navn: string
        }[]
      }
      kunde_db_rang_liste: {
        Args: { _saelger: string }
        Returns: {
          antal: number
          by: string
          company_id: string
          db: number
          db_foer: number
          navn: string
          rang: number
        }[]
      }
      kunde_rytme_genberegn: {
        Args: { _company_ids?: string[] }
        Returns: number
      }
      kunde_stop_skjuler: {
        Args: { _s: Database["public"]["Tables"]["kunde_stop"]["Row"] }
        Returns: boolean
      }
      kunde_stop_status: {
        Args: { _ids: string[] }
        Returns: {
          aarsag: string
          company_id: string
          skjult: boolean
          stoppet: boolean
        }[]
      }
      kunde_stop_vind_dato: {
        Args: { _s: Database["public"]["Tables"]["kunde_stop"]["Row"] }
        Returns: string
      }
      kundestatus: {
        Args: {
          _has_eq: boolean
          _last_any: string
          _last_cons: string
          _ref?: string
        }
        Returns: Database["public"]["Enums"]["customer_type"]
      }
      kundestatus_dage: {
        Args: {
          _har_visma: boolean
          _has_eq: boolean
          _last_any: string
          _last_cons: string
          _ref?: string
        }
        Returns: Database["public"]["Enums"]["customer_type"]
      }
      kundestatus_rang: {
        Args: { _t: Database["public"]["Enums"]["customer_type"] }
        Returns: number
      }
      kundetype: { Args: { _segment_3: string }; Returns: string }
      location_sales_summary: {
        Args: { _location_ids: string[] }
        Returns: {
          last_period: string
          last_purchase: string
          location_id: string
          revenue_12m: number
        }[]
      }
      log_import: {
        Args: {
          _afviste?: number
          _afviste_detaljer?: Json
          _fejl: string
          _filename: string
          _status: string
          _type: string
        }
        Returns: undefined
      }
      lok_saelger: { Args: { _location_id: string }; Returns: string }
      lok_saelger_noegle: {
        Args: { _i_aktoer: boolean; _no: string; _user: string }
        Returns: string
      }
      lokationer_med_leje: {
        Args: { _location_ids: string[] }
        Returns: string[]
      }
      maa_se_analyse: { Args: { _user_id: string }; Returns: boolean }
      maa_se_db: { Args: { _user_id: string }; Returns: boolean }
      maalepunkt_adgang: { Args: { _saelger: string }; Returns: boolean }
      maalepunkt_afdelinger:
        | { Args: { _saelger: string }; Returns: number[] }
        | {
            Args: { _afdeling_nr: number; _saelger: string }
            Returns: number[]
          }
      maalepunkt_aktive_kunder: {
        Args: {
          _afdeling_nr?: number
          _fra: string
          _saelger: string
          _til: string
        }
        Returns: {
          antal: number
          kategori: string
          maaned: string
        }[]
      }
      maalepunkt_aktive_kunder_detaljer: {
        Args: {
          _afdeling_nr?: number
          _fra: string
          _kategori: string
          _maaned?: string
          _saelger: string
          _til: string
        }
        Returns: {
          by: string
          company_id: string
          db: number
          navn: string
          omsaetning: number
        }[]
      }
      maalepunkt_aktive_kunder_unikke: {
        Args: {
          _afdeling_nr?: number
          _fra: string
          _saelger: string
          _til: string
        }
        Returns: {
          antal: number
          kategori: string
        }[]
      }
      maalepunkt_datadaekning: {
        Args: never
        Returns: {
          foerste_periode: string
          sidste_periode: string
        }[]
      }
      maalepunkt_db:
        | {
            Args: { _fra: string; _saelger: string; _til: string }
            Returns: {
              kategori: string
              maaned: string
              vaerdi: number
            }[]
          }
        | {
            Args: {
              _afdeling_nr?: number
              _fra: string
              _kun_forbrug: boolean
              _saelger: string
              _til: string
            }
            Returns: {
              kategori: string
              maaned: string
              vaerdi: number
            }[]
          }
      maalepunkt_db_detaljer: {
        Args: {
          _afdeling_nr?: number
          _fra: string
          _kategori?: string
          _maaned?: string
          _saelger: string
          _til: string
        }
        Returns: {
          by: string
          company_id: string
          db: number
          navn: string
          omsaetning: number
        }[]
      }
      maalepunkt_forbrug_grupper: { Args: never; Returns: string[] }
      maalepunkt_kundekategori: {
        Args: { _binding: string; _segment3: string }
        Returns: string
      }
      maalepunkt_maskiner:
        | {
            Args: { _fra: string; _saelger: string; _til: string }
            Returns: {
              antal: number
              brugt: boolean
              maaned: string
              maerke: string
            }[]
          }
        | {
            Args: {
              _afdeling_nr?: number
              _fra: string
              _kundetype?: string
              _saelger: string
              _til: string
            }
            Returns: {
              antal: number
              brugt: boolean
              maaned: string
              maerke: string
            }[]
          }
      maalepunkt_maskiner_detaljer: {
        Args: {
          _afdeling_nr?: number
          _brugt?: boolean
          _fra: string
          _kundetype?: string
          _maaned?: string
          _maerke: string
          _saelger: string
          _til: string
        }
        Returns: {
          antal: number
          beloeb: number
          brugt: boolean
          by: string
          company_id: string
          faktura_dato: string
          model: string
          navn: string
        }[]
      }
      maalepunkt_nye_kunder: {
        Args: {
          _afdeling_nr?: number
          _fra: string
          _saelger: string
          _til: string
        }
        Returns: {
          antal: number
          db: number
          kategori: string
          maaned: string
        }[]
      }
      maalepunkt_nye_kunder_detaljer: {
        Args: {
          _afdeling_nr?: number
          _fra: string
          _kategori: string
          _maaned?: string
          _saelger: string
          _til: string
        }
        Returns: {
          antal_konti: number
          by: string
          company_id: string
          foerste_ordre: string
          gruppe_by: string
          gruppe_foerste_ordre: string
          gruppe_key: string
          gruppe_navn: string
          gruppe_oprettet: string
          kundeprisgruppe_2: string
          navn: string
          omsaetning: number
          oprettet: string
          sidste_koeb: string
        }[]
      }
      maalepunkt_nye_lokationer: {
        Args: {
          _afdeling_nr?: number
          _fra: string
          _saelger: string
          _til: string
        }
        Returns: {
          antal: number
          kategori: string
          maaned: string
        }[]
      }
      maalepunkt_oms_detaljer: {
        Args: {
          _afdeling_nr?: number
          _fra: string
          _kategori: string
          _kun_forbrug?: boolean
          _maaned?: string
          _saelger: string
          _til: string
        }
        Returns: {
          by: string
          company_id: string
          db: number
          navn: string
          omsaetning: number
        }[]
      }
      maalepunkt_omsaetning:
        | {
            Args: { _fra: string; _saelger: string; _til: string }
            Returns: {
              kategori: string
              maaned: string
              vaerdi: number
            }[]
          }
        | {
            Args: {
              _afdeling_nr?: number
              _fra: string
              _kun_forbrug: boolean
              _saelger: string
              _til: string
            }
            Returns: {
              kategori: string
              maaned: string
              vaerdi: number
            }[]
          }
      maskin_bonusklasse: {
        Args: { _maaned: string; _type: string }
        Returns: string
      }
      maskin_er_tilvalg: { Args: { _txt: string }; Returns: boolean }
      maskin_maerke: { Args: { _txt: string }; Returns: string }
      maskin_modelfamilie: { Args: { _txt: string }; Returns: string }
      maskin_tilvalg_moenstre: { Args: never; Returns: string[] }
      maskiner_ret_afdeling: { Args: never; Returns: number }
      maskiner_uden_aftale_og_aflaesning: {
        Args: never
        Returns: {
          adresse: string
          afdeling_nr: number
          company_id: string
          company_navn: string
          kilde: string
          kundenr: string
          maskintype: string
          saelger_navn: string
          serienr: string
          unit_id: string
        }[]
      }
      maskiner_uden_lokation: {
        Args: never
        Returns: {
          adresse: string
          afdeling_nr: number
          beskrivelse: string
          company_id: string
          company_navn: string
          fak_kundenr: string
          lev_kundenr: string
          machine_id: string
          navn: string
          saelger_navn: string
          serienr: string
          udlanstype: string
          varenr: string
        }[]
      }
      maskiner_uden_lokation_forslag: {
        Args: never
        Returns: {
          adresse_ens: boolean
          antal_match: number
          lok_adresse: string
          lok_afdeling_nr: number
          lok_company_id: string
          lok_company_navn: string
          lok_id: string
          lok_kundenr: string
          machine_id: string
          ny_saelger_navn: string
          skifter_saelger: boolean
        }[]
      }
      monthly_revenue_totals: {
        Args: {
          _afdeling_nr?: number
          _company_ids?: string[]
          _periods: string[]
        }
        Returns: {
          companies_with_sales: number
          period: string
          revenue: number
        }[]
      }
      my_afdelinger: { Args: never; Returns: number[] }
      navn_norm: { Args: { _n: string }; Returns: string }
      navn_ord: { Args: { _n: string }; Returns: string[] }
      ny_kunde_bonus_maaned: {
        Args: { _fra: string; _til: string }
        Returns: {
          beloeb: number
          db: number
          maaned: string
          rang: number
          saelger: string
        }[]
      }
      penhed_fjern_indirekte: {
        Args: { _afdeling_nr: number; _p_nummer: string }
        Returns: undefined
      }
      penhed_koblingsforslag: {
        Args: { _cvr?: string }
        Returns: {
          afdeling_nr: number
          ansatte: number
          company_id: string
          company_name: string
          cvr: string
          husnr_afstand: number
          location_id: string
          lokation_adresse: string
          p_nummer: string
          penhed_adresse: string
          penhed_city: string
          penhed_zip: string
          samme_cvr: boolean
          visma_delivery_no: string
        }[]
      }
      penhed_saet_indirekte: {
        Args: {
          _afdeling_nr: number
          _company_id: string
          _note?: string
          _p_nummer: string
          _via_company_id: string
        }
        Returns: undefined
      }
      penhed_sync_candidates: {
        Args: never
        Returns: {
          cvr: string
        }[]
      }
      penhed_sync_overblik: { Args: never; Returns: Json }
      penhed_sync_prioriter: { Args: { _cvr: string }; Returns: undefined }
      penhed_sync_registrer: {
        Args: { _antal: number; _cvr: string; _fejl: string; _status: string }
        Returns: undefined
      }
      pnr_link_location: {
        Args: { _afd: number; _dno: string; _loc: string }
        Returns: string
      }
      portfolio_aggregat: {
        Args: { _afdeling_nr?: number; _saelger?: string }
        Returns: {
          address: string
          assigned_to: string
          city: string
          cons_perioder: string[]
          consumable_rev12m: number
          contribution12m: number
          customer_type: string
          employees: number
          forbrug12m: number
          forbrug12m_prior: number
          has_active_equipment: boolean
          id: string
          is_public: boolean
          kreditspaerret: boolean
          last_cons_now: string
          last_cons_prior: string
          last_consumable_sales_date: string
          last_sales_date: string
          last_sales_now: string
          last_sales_prior: string
          lok_antal: number
          lok_total: number
          monthly: number[]
          name: string
          revenue_ytd: number
          revenue_ytd_prior: number
          revenue12m: number
          revenue12m_prior: number
          saelger_navn: string
          sektor: string
          stop_aarsag: string
          stop_skjult: boolean
          stoppet: boolean
          vare_grupper: string[]
          ytd_prior_last_month_rev: number
          zip: string
        }[]
      }
      portfolio_aggregat_json: {
        Args: { _afdeling_nr?: number; _saelger?: string }
        Returns: Json
      }
      portfolio_db_ytd: {
        Args: { _afdeling_nr?: number; _saelger?: string }
        Returns: {
          contribution_ytd: number
          fra: string
          revenue_ytd: number
          til: string
        }[]
      }
      portfolio_totaler: {
        Args: { _afdeling_nr?: number; _saelger?: string }
        Returns: {
          contribution12m: number
          latest_period: string
          revenue_ytd: number
          revenue_ytd_prior: number
          revenue12m: number
          revenue12m_prior_year: number
          weight_kg_ytd: number
          weight_kg_ytd_prior: number
          ytd_prior_last_month_rev: number
          ytd_prior_last_month_weight_kg: number
        }[]
      }
      prune_invoice_lines_month: {
        Args: {
          _afdelinger: number[]
          _batch_id: string
          _from: string
          _month_start: string
          _to: string
        }
        Returns: number
      }
      queue_penhed_sync_naeste: { Args: never; Returns: number }
      quote_recipient_by_token: { Args: { _token: string }; Returns: Json }
      quote_track_event: {
        Args: { _event: string; _token: string; _user_agent?: string }
        Returns: boolean
      }
      rebuild_products: { Args: never; Returns: number }
      rebuild_sales_aggregates: {
        Args: {
          _from: string
          _kun_afdelinger?: number[]
          _med_top?: boolean
          _to: string
        }
        Returns: {
          maaned: string
          monthly_rows: number
          product_rows: number
        }[]
      }
      rebuild_top_products: {
        Args: { _kun_afdelinger?: number[] }
        Returns: number
      }
      recompute_all_company_statuses: { Args: never; Returns: number }
      recompute_company_status: {
        Args: { _company_id: string }
        Returns: undefined
      }
      recompute_company_statuses_batch: {
        Args: { _company_ids: string[] }
        Returns: number
      }
      region_for_postnr: { Args: { _zip: string }; Returns: string }
      registrer_udfald: {
        Args: {
          _aarsag?: string
          _company: string
          _contact_id?: string
          _kontakt_email?: string
          _kontakt_telefon?: string
          _kontakt_titel?: string
          _list: string
          _moede_at?: string
          _note?: string
          _ring_igen_at?: string
          _udfald: string
        }
        Returns: Json
      }
      relink_sales_locations: { Args: never; Returns: Json }
      reservedele_til_betaling: {
        Args: { _saelger: string }
        Returns: {
          adresse: string
          by: string
          company_id: string
          dato: string
          location_id: string
          maskintype: string
          saelger_user_id: string
          serienr: string
          virksomhed: string
        }[]
      }
      rytme_graense_dage: {
        Args: { _interval: number; _koebsmaaneder: number }
        Returns: number
      }
      saelger_navn: { Args: { _id: string }; Returns: string }
      saeson_faktor: {
        Args: { _group: string; _period: string }
        Returns: number
      }
      saet_maskine_placering: {
        Args: { _placering: string; _serienr: string }
        Returns: undefined
      }
      sales_period_completeness_rows: {
        Args: never
        Returns: {
          er_komplet: boolean
          kg: number
          lokationer: number
          lokationer_sidste_aar: number
          median_lokationer: number
          pct_af_median: number
          period: string
        }[]
      }
      sales_season_index_rows: {
        Args: never
        Returns: {
          komplette_maaneder_i_alt: number
          maaned: number
          maaneder_i_grundlag: number
          product_group_1: string
          saeson_indeks: number
        }[]
      }
      salg_uden_kunde: {
        Args: { _afd?: number }
        Returns: {
          ikke_kunde_antal: number
          ikke_kunde_beloeb: number
          kunde_antal: number
          kunde_beloeb: number
        }[]
      }
      salg_uden_kunde_liste: {
        Args: { _afd?: number }
        Returns: {
          afdeling_nr: number
          beloeb: number
          findes_som_kunde: boolean
          foerste: string
          kunde_afdeling: number
          kunde_navn: string
          kunde_navn_crm: string
          seneste: string
          visma_delivery_no: string
        }[]
      }
      scenarie_gor_gaeldende: { Args: { _id: string }; Returns: string }
      scenarie_kopier: { Args: { _id: string; _navn: string }; Returns: string }
      scenarie_opret: {
        Args: { _beskrivelse?: string; _navn: string; _status?: string }
        Returns: string
      }
      sektorfordeling: {
        Args: { _afdeling_nr?: number; _fra: string; _til: string }
        Returns: {
          antal_kunder: number
          db: number
          omsaetning: number
          segment: string
        }[]
      }
      send_quote: {
        Args: { _quote_id: string }
        Returns: {
          expiry_date: string
          frozen_at: string
          public_token: string
          status: string
        }[]
      }
      seneste_fakturadato: { Args: never; Returns: string }
      set_primary_location: {
        Args: {
          p_afdeling_nr: number
          p_company_id: string
          p_visma_delivery_no: string
        }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      skm_genberegn_alt: { Args: { _afdeling_nr?: number }; Returns: number }
      snapshot_forbrug_signal: { Args: never; Returns: number }
      soesterkonti_par: {
        Args: never
        Returns: {
          afdeling_nr: number
          aktiv_adresse: string
          aktiv_company_id: string
          aktiv_konto: string
          aktiv_navn: string
          aktiv_sidste_koeb: string
          cvr: string
          samme_virksomhed: boolean
          sovende_adresse: string
          sovende_company_id: string
          sovende_konto: string
          sovende_navn: string
          sovende_sidste_koeb: string
        }[]
      }
      sortiment_daekning: { Args: { _company_id: string }; Returns: Json }
      te_sortiment_kunde: { Args: { _company_id: string }; Returns: Json }
      te_sortiment_oversigt: {
        Args: never
        Returns: {
          company_id: string
          customer_segment_1: string
          kg_pr_type: Json
          kg_total: number
          name: string
          saelger: string
        }[]
      }
      telemarketing_brugere: {
        Args: never
        Returns: {
          navn: string
          user_id: string
        }[]
      }
      tick_cvr_enrichment: {
        Args: { _apikey: string; _url: string }
        Returns: boolean
      }
      tick_invoice_import: {
        Args: { _apikey: string; _url: string }
        Returns: boolean
      }
      tick_penhed_sync: {
        Args: { _apikey: string; _url: string }
        Returns: boolean
      }
      tildel_penhed: {
        Args: { _company_id: string; _p_nummer: string; _saelger: string }
        Returns: string
      }
      tm_er_ringer: { Args: { _list: string }; Returns: boolean }
      tm_gem_kontakt: {
        Args: {
          _company: string
          _email: string
          _id: string
          _list: string
          _navn: string
          _telefon: string
          _titel: string
        }
        Returns: string
      }
      tm_moede_saelger: {
        Args: { _company: string; _list: string }
        Returns: string
      }
      tm_pre_request: { Args: never; Returns: undefined }
      tm_registrer_opkald: {
        Args: {
          _aarsag?: string
          _company: string
          _contact_id?: string
          _kontakt_email?: string
          _kontakt_telefon?: string
          _kontakt_titel?: string
          _list: string
          _moede_at?: string
          _note?: string
          _ring_igen_at?: string
          _udfald: string
        }
        Returns: Json
      }
      tm_seneste_aktivitet: { Args: { _list: string }; Returns: Json }
      tm_virksomheder: { Args: { _list: string }; Returns: Json }
      udstyr_er_filter: { Args: { _t: string }; Returns: boolean }
      udstyr_grundlag: {
        Args: {
          _alle: boolean
          _company?: string
          _fra: string
          _saelger: string
          _til: string
        }
        Returns: Json
      }
      udstyr_leje_uden_bonusklasse: {
        Args: never
        Returns: {
          beloeb_12m: number
          maskintype: string
          varenr: string
          varetekst: string
        }[]
      }
      udstyr_linjer: {
        Args: { _fra: string; _lev: string; _til: string }
        Returns: {
          antal: number
          beloeb: number
          db: number
          kostpris: number
          period: string
          varegruppe: string
          varenr: string
          varetekst: string
        }[]
      }
      udstyr_refresh_maaned: { Args: { _m: string }; Returns: undefined }
      udstyr_toem_ko: { Args: { _maks?: number }; Returns: number }
      udstyr_type_leje: {
        Args: { _bonusklasse: string; _varetekst: string }
        Returns: string
      }
      udstyr_type_tekst: { Args: { _t: string }; Returns: string }
      vind_tilbage_liste: {
        Args: { _saelger?: string }
        Returns: {
          company_id: string
          company_name: string
          konkurrent: string
          location_id: string
          lokation: string
          oprettet_at: string
          saelger: string
          stop_id: string
          udloeber: string
          vind_dato: string
        }[]
      }
    }
    Enums: {
      activity_type:
        | "opkald"
        | "email"
        | "linkedin"
        | "besøg"
        | "møde"
        | "teams_møde"
        | "tilbud_sendt"
        | "opfølgning"
        | "intern_note"
        | "telefonopkald"
        | "ikke_truffet"
        | "opfølgning_aftalt"
        | "andet"
      agreement_type: "offentlig" | "erhverv" | "ski" | "ukendt"
      app_role: "admin" | "saelger" | "salgssupport" | "telemarketing"
      assignment_status:
        | "ny"
        | "skal_kontaktes"
        | "kontaktet"
        | "talt_med"
        | "møde_booket"
        | "tilbud_sendt"
        | "ikke_relevant"
        | "senere_emne"
        | "vundet"
        | "tabt"
        | "forsoegt"
        | "ring_igen"
        | "forkert_nummer"
        | "ikke_interesseret"
        | "oensker_ikke_kontakt"
        | "tilbud_oensket"
        | "ikke_opnaaet"
      company_relation_type:
        | "forsynes_af"
        | "leverer_til"
        | "maskiner_paa"
        | "efterfoelger"
      customer_type:
        | "nyt_emne"
        | "aktiv_kunde"
        | "sovende_kunde"
        | "servicekunde"
        | "tidligere_kunde"
      institution_type:
        | "børnehave"
        | "skole"
        | "plejecenter"
        | "kommune"
        | "region"
        | "stat"
        | "andet_offentligt"
      kontakt_kilde: "visma" | "cvr" | "crm" | "telemarketing"
      moede_udfald: "afholdt" | "aflyst" | "no_show" | "flyttet"
      opportunity_status:
        | "emne"
        | "ny"
        | "behovsafdækning"
        | "møde_demo"
        | "tilbud_under_udarbejdelse"
        | "tilbud_sendt"
        | "opfølgning"
        | "vundet"
        | "tabt"
        | "sat_på_pause"
      opportunity_status_v2: "moede_booket" | "tilbud_sendt" | "vundet" | "tabt"
      priority_level: "høj" | "middel" | "lav"
      quote_status:
        | "kladde"
        | "sendt"
        | "under_opfølgning"
        | "accepteret"
        | "afvist"
        | "udløbet"
      relation_suggestion_status: "pending" | "confirmed" | "rejected"
      tabt_aarsag: "pris" | "konkurrent" | "ikke_relevant" | "timing" | "andet"
    }
    CompositeTypes: {
      bonus_maskin_detalje_row: {
        company_id: string | null
        navn: string | null
        by: string | null
        model: string | null
        maerke: string | null
        kilde: string | null
        brugt: boolean | null
        antal: number | null
        faktura_dato: string | null
        beloeb: number | null
        serienr: string | null
        bonusklasse: string | null
        udeladt: boolean | null
        aarsag: string | null
        status: string | null
        vurdering: string | null
        brugt_kilde: string | null
        forgaenger_serienr: string | null
        forgaenger_dato: string | null
        godkendt: boolean | null
        sats: number | null
        maaned: string | null
      }
      bonus_maskin_grundlag_row: {
        maaned: string | null
        company_id: string | null
        navn: string | null
        by: string | null
        kategori: string | null
        maerke: string | null
        brugt: boolean | null
        kilde: string | null
        model: string | null
        antal: number | null
        faktura_dato: string | null
        beloeb: number | null
        serienr: string | null
        bonusklasse: string | null
        udeladt: boolean | null
        aarsag: string | null
        status: string | null
        vurdering: string | null
        brugt_kilde: string | null
        forgaenger_serienr: string | null
        forgaenger_dato: string | null
        godkendt: boolean | null
        lev_kundenr: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_type: [
        "opkald",
        "email",
        "linkedin",
        "besøg",
        "møde",
        "teams_møde",
        "tilbud_sendt",
        "opfølgning",
        "intern_note",
        "telefonopkald",
        "ikke_truffet",
        "opfølgning_aftalt",
        "andet",
      ],
      agreement_type: ["offentlig", "erhverv", "ski", "ukendt"],
      app_role: ["admin", "saelger", "salgssupport", "telemarketing"],
      assignment_status: [
        "ny",
        "skal_kontaktes",
        "kontaktet",
        "talt_med",
        "møde_booket",
        "tilbud_sendt",
        "ikke_relevant",
        "senere_emne",
        "vundet",
        "tabt",
        "forsoegt",
        "ring_igen",
        "forkert_nummer",
        "ikke_interesseret",
        "oensker_ikke_kontakt",
        "tilbud_oensket",
        "ikke_opnaaet",
      ],
      company_relation_type: [
        "forsynes_af",
        "leverer_til",
        "maskiner_paa",
        "efterfoelger",
      ],
      customer_type: [
        "nyt_emne",
        "aktiv_kunde",
        "sovende_kunde",
        "servicekunde",
        "tidligere_kunde",
      ],
      institution_type: [
        "børnehave",
        "skole",
        "plejecenter",
        "kommune",
        "region",
        "stat",
        "andet_offentligt",
      ],
      kontakt_kilde: ["visma", "cvr", "crm", "telemarketing"],
      moede_udfald: ["afholdt", "aflyst", "no_show", "flyttet"],
      opportunity_status: [
        "emne",
        "ny",
        "behovsafdækning",
        "møde_demo",
        "tilbud_under_udarbejdelse",
        "tilbud_sendt",
        "opfølgning",
        "vundet",
        "tabt",
        "sat_på_pause",
      ],
      opportunity_status_v2: ["moede_booket", "tilbud_sendt", "vundet", "tabt"],
      priority_level: ["høj", "middel", "lav"],
      quote_status: [
        "kladde",
        "sendt",
        "under_opfølgning",
        "accepteret",
        "afvist",
        "udløbet",
      ],
      relation_suggestion_status: ["pending", "confirmed", "rejected"],
      tabt_aarsag: ["pris", "konkurrent", "ikke_relevant", "timing", "andet"],
    },
  },
} as const
