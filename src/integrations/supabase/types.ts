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
      activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
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
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
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
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
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
        }
        Relationships: [
          {
            foreignKeyName: "activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_list_assignment_id_fkey"
            columns: ["contact_list_assignment_id"]
            isOneToOne: false
            referencedRelation: "contact_list_assignments"
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
      agreements: {
        Row: {
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
          name: string
          notes: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
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
          name: string
          notes?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
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
        ]
      }
      companies: {
        Row: {
          address: string | null
          assigned_to: string | null
          bi_branch_1_code: string | null
          bi_branch_2_code: string | null
          bi_branch_3_code: string | null
          city: string | null
          contact_person: string | null
          created_at: string
          created_in_visma: string | null
          customer_segment_1: string | null
          customer_segment_2: string | null
          customer_segment_3: string | null
          customer_type: Database["public"]["Enums"]["customer_type"]
          cvr: string | null
          cvr_p_enhed_count: number | null
          ean_number: string | null
          email: string | null
          employees: number | null
          id: string
          import_batch_date: string | null
          import_batch_id: string | null
          industry: string | null
          institution_type:
            | Database["public"]["Enums"]["institution_type"]
            | null
          is_public: boolean
          last_purchase_date: string | null
          main_branch_code: string | null
          main_branch_text: string | null
          municipality: string | null
          name: string
          parent_cvr: string | null
          phone: string | null
          source: string | null
          source_created_by: string | null
          source_updated_at: string | null
          sources: string[]
          turnover_12m: number | null
          visma_delivery_id: string | null
          visma_id: string | null
          visma_notes: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          assigned_to?: string | null
          bi_branch_1_code?: string | null
          bi_branch_2_code?: string | null
          bi_branch_3_code?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          created_in_visma?: string | null
          customer_segment_1?: string | null
          customer_segment_2?: string | null
          customer_segment_3?: string | null
          customer_type?: Database["public"]["Enums"]["customer_type"]
          cvr?: string | null
          cvr_p_enhed_count?: number | null
          ean_number?: string | null
          email?: string | null
          employees?: number | null
          id?: string
          import_batch_date?: string | null
          import_batch_id?: string | null
          industry?: string | null
          institution_type?:
            | Database["public"]["Enums"]["institution_type"]
            | null
          is_public?: boolean
          last_purchase_date?: string | null
          main_branch_code?: string | null
          main_branch_text?: string | null
          municipality?: string | null
          name: string
          parent_cvr?: string | null
          phone?: string | null
          source?: string | null
          source_created_by?: string | null
          source_updated_at?: string | null
          sources?: string[]
          turnover_12m?: number | null
          visma_delivery_id?: string | null
          visma_id?: string | null
          visma_notes?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          assigned_to?: string | null
          bi_branch_1_code?: string | null
          bi_branch_2_code?: string | null
          bi_branch_3_code?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          created_in_visma?: string | null
          customer_segment_1?: string | null
          customer_segment_2?: string | null
          customer_segment_3?: string | null
          customer_type?: Database["public"]["Enums"]["customer_type"]
          cvr?: string | null
          cvr_p_enhed_count?: number | null
          ean_number?: string | null
          email?: string | null
          employees?: number | null
          id?: string
          import_batch_date?: string | null
          import_batch_id?: string | null
          industry?: string | null
          institution_type?:
            | Database["public"]["Enums"]["institution_type"]
            | null
          is_public?: boolean
          last_purchase_date?: string | null
          main_branch_code?: string | null
          main_branch_text?: string | null
          municipality?: string | null
          name?: string
          parent_cvr?: string | null
          phone?: string | null
          source?: string | null
          source_created_by?: string | null
          source_updated_at?: string | null
          sources?: string[]
          turnover_12m?: number | null
          visma_delivery_id?: string | null
          visma_id?: string | null
          visma_notes?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "company_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_assignments: {
        Row: {
          company_id: string
          competitor_id: string
          contract_expires_at: string | null
          created_at: string
          id: string
          notes: string | null
          registered_by: string
          updated_at: string
        }
        Insert: {
          company_id: string
          competitor_id: string
          contract_expires_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          registered_by: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          competitor_id?: string
          contract_expires_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          registered_by?: string
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
            foreignKeyName: "competitor_assignments_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
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
          updated_at: string
        }
        Insert: {
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
          updated_at?: string
        }
        Update: {
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
          name: string
          purpose: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          purpose?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
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
            foreignKeyName: "contacts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
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
      import_batches: {
        Row: {
          company_count: number
          created_at: string
          created_by: string
          filename: string | null
          id: string
        }
        Insert: {
          company_count?: number
          created_at?: string
          created_by: string
          filename?: string | null
          id?: string
        }
        Update: {
          company_count?: number
          created_at?: string
          created_by?: string
          filename?: string | null
          id?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          address: string | null
          agreement_types: string | null
          city: string | null
          company_id: string
          contact_person: string | null
          created_at: string
          email: string | null
          equipment_coffee_machines: number | null
          equipment_cooling: number | null
          equipment_filters: number | null
          equipment_frellsen_owned: number | null
          equipment_service_contracts: number | null
          equipment_summary: string | null
          equipment_updated_at: string | null
          has_free_loan: boolean | null
          has_lease_agreement: boolean | null
          id: string
          is_primary: boolean
          phone: string | null
          sales_signal: string | null
          visma_delivery_no: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          agreement_types?: string | null
          city?: string | null
          company_id: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          equipment_coffee_machines?: number | null
          equipment_cooling?: number | null
          equipment_filters?: number | null
          equipment_frellsen_owned?: number | null
          equipment_service_contracts?: number | null
          equipment_summary?: string | null
          equipment_updated_at?: string | null
          has_free_loan?: boolean | null
          has_lease_agreement?: boolean | null
          id?: string
          is_primary?: boolean
          phone?: string | null
          sales_signal?: string | null
          visma_delivery_no?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          agreement_types?: string | null
          city?: string | null
          company_id?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          equipment_coffee_machines?: number | null
          equipment_cooling?: number | null
          equipment_filters?: number | null
          equipment_frellsen_owned?: number | null
          equipment_service_contracts?: number | null
          equipment_summary?: string | null
          equipment_updated_at?: string | null
          has_free_loan?: boolean | null
          has_lease_agreement?: boolean | null
          id?: string
          is_primary?: boolean
          phone?: string | null
          sales_signal?: string | null
          visma_delivery_no?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          region: string | null
          salesperson_no: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          is_active?: boolean
          region?: string | null
          salesperson_no?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          region?: string | null
          salesperson_no?: string | null
        }
        Relationships: []
      }
      quotes: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          estimated_value: number | null
          expiry_date: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          quote_number: string | null
          sent_date: string | null
          status: Database["public"]["Enums"]["quote_status"]
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          estimated_value?: number | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          quote_number?: string | null
          sent_date?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          estimated_value?: number | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          quote_number?: string | null
          sent_date?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
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
            foreignKeyName: "quotes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "sales_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_opportunities: {
        Row: {
          assigned_to: string | null
          company_id: string
          created_at: string
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          name: string
          next_action: string | null
          next_followup_date: string | null
          opportunity_type: string | null
          probability: number | null
          status: Database["public"]["Enums"]["opportunity_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company_id: string
          created_at?: string
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          name: string
          next_action?: string | null
          next_followup_date?: string | null
          opportunity_type?: string | null
          probability?: number | null
          status?: Database["public"]["Enums"]["opportunity_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string
          created_at?: string
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          name?: string
          next_action?: string | null
          next_followup_date?: string | null
          opportunity_type?: string | null
          probability?: number | null
          status?: Database["public"]["Enums"]["opportunity_status"]
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
      [_ in never]: never
    }
    Functions: {
      can_access_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      get_user_region: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
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
      app_role: "admin" | "saelger" | "salgssupport"
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
      customer_type:
        | "nyt_emne"
        | "aktiv_kunde"
        | "sovende_kunde"
        | "tidligere_kunde"
      institution_type:
        | "børnehave"
        | "skole"
        | "plejecenter"
        | "kommune"
        | "region"
        | "stat"
        | "andet_offentligt"
      opportunity_status:
        | "ny"
        | "behovsafdækning"
        | "møde_demo"
        | "tilbud_under_udarbejdelse"
        | "tilbud_sendt"
        | "opfølgning"
        | "vundet"
        | "tabt"
        | "sat_på_pause"
      priority_level: "høj" | "middel" | "lav"
      quote_status:
        | "kladde"
        | "sendt"
        | "under_opfølgning"
        | "accepteret"
        | "afvist"
        | "udløbet"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "saelger", "salgssupport"],
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
      ],
      customer_type: [
        "nyt_emne",
        "aktiv_kunde",
        "sovende_kunde",
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
      opportunity_status: [
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
      priority_level: ["høj", "middel", "lav"],
      quote_status: [
        "kladde",
        "sendt",
        "under_opfølgning",
        "accepteret",
        "afvist",
        "udløbet",
      ],
    },
  },
} as const
