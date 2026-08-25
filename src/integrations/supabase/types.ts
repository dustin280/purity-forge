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
      access_logs: {
        Row: {
          created_at: string
          event: string
          id: string
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      accession_number_counter: {
        Row: {
          id: number
          last_number: number
        }
        Insert: {
          id?: number
          last_number: number
        }
        Update: {
          id?: number
          last_number?: number
        }
        Relationships: []
      }
      ai_chat_messages: {
        Row: {
          created_at: string
          id: string
          parts: Json
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parts?: Json
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parts?: Json
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_threads: {
        Row: {
          agent: string
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          doc_id: string
          embedding: string
          id: string
          page_number: number | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          doc_id: string
          embedding: string
          id?: string
          page_number?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          doc_id?: string
          embedding?: string
          id?: string
          page_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_chunks_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "ai_knowledge_docs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_docs: {
        Row: {
          agent_scope: string
          chunk_count: number
          created_at: string
          created_by: string | null
          id: string
          page_count: number | null
          source_filename: string | null
          title: string
          updated_at: string
        }
        Insert: {
          agent_scope?: string
          chunk_count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          page_count?: number | null
          source_filename?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          agent_scope?: string
          chunk_count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          page_count?: number | null
          source_filename?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      analysis_batch_counters: {
        Row: {
          last_seq: number
          test_type: string
        }
        Insert: {
          last_seq?: number
          test_type: string
        }
        Update: {
          last_seq?: number
          test_type?: string
        }
        Relationships: []
      }
      analysis_batch_items: {
        Row: {
          batch_id: string
          created_at: string
          day3_checked_at: string | null
          day3_checked_by: string | null
          day3_notes: string | null
          day3_notified_at: string | null
          day3_status: string
          day7_checked_at: string | null
          day7_checked_by: string | null
          day7_notes: string | null
          day7_notified_at: string | null
          day7_status: string
          id: string
          sample_id: string
          storage_slot_id: string | null
          test_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          day3_checked_at?: string | null
          day3_checked_by?: string | null
          day3_notes?: string | null
          day3_notified_at?: string | null
          day3_status?: string
          day7_checked_at?: string | null
          day7_checked_by?: string | null
          day7_notes?: string | null
          day7_notified_at?: string | null
          day7_status?: string
          id?: string
          sample_id: string
          storage_slot_id?: string | null
          test_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          day3_checked_at?: string | null
          day3_checked_by?: string | null
          day3_notes?: string | null
          day3_notified_at?: string | null
          day3_status?: string
          day7_checked_at?: string | null
          day7_checked_by?: string | null
          day7_notes?: string | null
          day7_notified_at?: string | null
          day7_status?: string
          id?: string
          sample_id?: string
          storage_slot_id?: string | null
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "analysis_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_batch_items_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_batch_items_storage_slot_id_fkey"
            columns: ["storage_slot_id"]
            isOneToOne: false
            referencedRelation: "storage_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_batch_items_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: true
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_batches: {
        Row: {
          batch_number: string
          created_at: string
          details: Json
          id: string
          incubation_started_at: string | null
          method: string | null
          performed_at: string
          performed_by: string | null
          readout_notified_at: string | null
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          test_type: string
          updated_at: string
        }
        Insert: {
          batch_number: string
          created_at?: string
          details?: Json
          id?: string
          incubation_started_at?: string | null
          method?: string | null
          performed_at?: string
          performed_by?: string | null
          readout_notified_at?: string | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          test_type: string
          updated_at?: string
        }
        Update: {
          batch_number?: string
          created_at?: string
          details?: Json
          id?: string
          incubation_started_at?: string | null
          method?: string | null
          performed_at?: string
          performed_by?: string | null
          readout_notified_at?: string | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          test_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          diff: Json | null
          id: string
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          diff?: Json | null
          id?: string
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          diff?: Json | null
          id?: string
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      cal_qc_peak_log: {
        Row: {
          amount: number | null
          area: number | null
          calibration_level: number | null
          compound_id: string | null
          concentration_level: number | null
          concentration_unit: string | null
          created_at: string
          id: string
          injection_id: string
          match_confidence: string
          raw_compound_name: string
          reading_at: string
          rt: number
          sample_name: string | null
          sample_type: string
          sequence_name: string
          source_result_file_id: string
        }
        Insert: {
          amount?: number | null
          area?: number | null
          calibration_level?: number | null
          compound_id?: string | null
          concentration_level?: number | null
          concentration_unit?: string | null
          created_at?: string
          id?: string
          injection_id: string
          match_confidence: string
          raw_compound_name: string
          reading_at: string
          rt: number
          sample_name?: string | null
          sample_type: string
          sequence_name: string
          source_result_file_id: string
        }
        Update: {
          amount?: number | null
          area?: number | null
          calibration_level?: number | null
          compound_id?: string | null
          concentration_level?: number | null
          concentration_unit?: string | null
          created_at?: string
          id?: string
          injection_id?: string
          match_confidence?: string
          raw_compound_name?: string
          reading_at?: string
          rt?: number
          sample_name?: string | null
          sample_type?: string
          sequence_name?: string
          source_result_file_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cal_qc_peak_log_compound_id_fkey"
            columns: ["compound_id"]
            isOneToOne: false
            referencedRelation: "compounds"
            referencedColumns: ["id"]
          },
        ]
      }
      chain_of_custody_fields: {
        Row: {
          created_at: string
          field_key: string
          field_type: Database["public"]["Enums"]["coc_field_type"]
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          options: Json | null
          placeholder: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_key: string
          field_type?: Database["public"]["Enums"]["coc_field_type"]
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          options?: Json | null
          placeholder?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_key?: string
          field_type?: Database["public"]["Enums"]["coc_field_type"]
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          options?: Json | null
          placeholder?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      chain_of_custody_records: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          line_items: Json
          sample_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          line_items?: Json
          sample_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          line_items?: Json
          sample_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          sort_order: number
          title: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          company_name: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          primary_contact_email: string | null
          primary_contact_name: string | null
          primary_contact_phone: string | null
          primary_contact_title: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          primary_contact_title?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          primary_contact_title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      coc_attachments: {
        Row: {
          coc_id: string
          content_type: string | null
          file_name: string
          file_path: string
          id: string
          line_item_index: number | null
          size_bytes: number | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          coc_id: string
          content_type?: string | null
          file_name: string
          file_path: string
          id?: string
          line_item_index?: number | null
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          coc_id?: string
          content_type?: string | null
          file_name?: string
          file_path?: string
          id?: string
          line_item_index?: number | null
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coc_attachments_coc_id_fkey"
            columns: ["coc_id"]
            isOneToOne: false
            referencedRelation: "chain_of_custody_records"
            referencedColumns: ["id"]
          },
        ]
      }
      coc_invoice_counters: {
        Row: {
          day: string
          last_seq: number
        }
        Insert: {
          day: string
          last_seq?: number
        }
        Update: {
          day?: string
          last_seq?: number
        }
        Relationships: []
      }
      compound_blend_components: {
        Row: {
          blend_id: string
          cal_l1_mg_per_ml: number | null
          cal_l2_mg_per_ml: number | null
          cal_l3_mg_per_ml: number | null
          cal_l4_mg_per_ml: number | null
          cal_l5_mg_per_ml: number | null
          cal_l6_mg_per_ml: number | null
          component_id: string
          created_at: string
          id: string
          nominal_amount_unit: string | null
          nominal_amount_value: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          blend_id: string
          cal_l1_mg_per_ml?: number | null
          cal_l2_mg_per_ml?: number | null
          cal_l3_mg_per_ml?: number | null
          cal_l4_mg_per_ml?: number | null
          cal_l5_mg_per_ml?: number | null
          cal_l6_mg_per_ml?: number | null
          component_id: string
          created_at?: string
          id?: string
          nominal_amount_unit?: string | null
          nominal_amount_value?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          blend_id?: string
          cal_l1_mg_per_ml?: number | null
          cal_l2_mg_per_ml?: number | null
          cal_l3_mg_per_ml?: number | null
          cal_l4_mg_per_ml?: number | null
          cal_l5_mg_per_ml?: number | null
          cal_l6_mg_per_ml?: number | null
          component_id?: string
          created_at?: string
          id?: string
          nominal_amount_unit?: string | null
          nominal_amount_value?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compound_blend_components_blend_id_fkey"
            columns: ["blend_id"]
            isOneToOne: false
            referencedRelation: "compounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compound_blend_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "compounds"
            referencedColumns: ["id"]
          },
        ]
      }
      compounds: {
        Row: {
          acquisition_method: string | null
          column_temperature_c: number | null
          combined_net_content_unit: string | null
          combined_net_content_value: number | null
          created_at: string
          created_by: string | null
          default_diluent_name: string | null
          cal_l1_mg_per_ml: number | null
          cal_l2_mg_per_ml: number | null
          cal_l3_mg_per_ml: number | null
          cal_l4_mg_per_ml: number | null
          cal_l5_mg_per_ml: number | null
          cal_l6_mg_per_ml: number | null
          id: string
          injection_volume_ul: number | null
          is_active: boolean
          is_blend: boolean
          method_group_id: string | null
          name: string
          processing_method: string | null
          sp_analyte_id: string | null
          updated_at: string
        }
        Insert: {
          acquisition_method?: string | null
          column_temperature_c?: number | null
          combined_net_content_unit?: string | null
          combined_net_content_value?: number | null
          created_at?: string
          created_by?: string | null
          default_diluent_name?: string | null
          cal_l1_mg_per_ml?: number | null
          cal_l2_mg_per_ml?: number | null
          cal_l3_mg_per_ml?: number | null
          cal_l4_mg_per_ml?: number | null
          cal_l5_mg_per_ml?: number | null
          cal_l6_mg_per_ml?: number | null
          id?: string
          injection_volume_ul?: number | null
          is_active?: boolean
          is_blend?: boolean
          method_group_id?: string | null
          name: string
          processing_method?: string | null
          sp_analyte_id?: string | null
          updated_at?: string
        }
        Update: {
          acquisition_method?: string | null
          column_temperature_c?: number | null
          combined_net_content_unit?: string | null
          combined_net_content_value?: number | null
          created_at?: string
          created_by?: string | null
          default_diluent_name?: string | null
          cal_l1_mg_per_ml?: number | null
          cal_l2_mg_per_ml?: number | null
          cal_l3_mg_per_ml?: number | null
          cal_l4_mg_per_ml?: number | null
          cal_l5_mg_per_ml?: number | null
          cal_l6_mg_per_ml?: number | null
          id?: string
          injection_volume_ul?: number | null
          is_active?: boolean
          is_blend?: boolean
          method_group_id?: string | null
          name?: string
          processing_method?: string | null
          sp_analyte_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compounds_method_group_id_fkey"
            columns: ["method_group_id"]
            isOneToOne: false
            referencedRelation: "method_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compounds_sp_analyte_id_fkey"
            columns: ["sp_analyte_id"]
            isOneToOne: false
            referencedRelation: "sp_analytes"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_backpressure_logs: {
        Row: {
          acquisition_method: string | null
          backpressure: number
          backpressure_unit: string
          column_name: string | null
          column_temp: number | null
          column_temp_unit: string | null
          created_at: string
          created_by: string | null
          drive_dx_file_id: string | null
          drive_result_folder_id: string | null
          flow_rate: number | null
          flow_rate_unit: string | null
          id: string
          injections_count: number | null
          instrument: string
          mobile_phase: string | null
          notes: string | null
          pressure_run_max: number | null
          pressure_run_min: number | null
          reading_at: string
          source: string
          updated_at: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          acquisition_method?: string | null
          backpressure: number
          backpressure_unit?: string
          column_name?: string | null
          column_temp?: number | null
          column_temp_unit?: string | null
          created_at?: string
          created_by?: string | null
          drive_dx_file_id?: string | null
          drive_result_folder_id?: string | null
          flow_rate?: number | null
          flow_rate_unit?: string | null
          id?: string
          injections_count?: number | null
          instrument?: string
          mobile_phase?: string | null
          notes?: string | null
          pressure_run_max?: number | null
          pressure_run_min?: number | null
          reading_at?: string
          source?: string
          updated_at?: string
          user_id?: string | null
          user_name: string
        }
        Update: {
          acquisition_method?: string | null
          backpressure?: number
          backpressure_unit?: string
          column_name?: string | null
          column_temp?: number | null
          column_temp_unit?: string | null
          created_at?: string
          created_by?: string | null
          drive_dx_file_id?: string | null
          drive_result_folder_id?: string | null
          flow_rate?: number | null
          flow_rate_unit?: string | null
          id?: string
          injections_count?: number | null
          instrument?: string
          mobile_phase?: string | null
          notes?: string | null
          pressure_run_max?: number | null
          pressure_run_min?: number | null
          reading_at?: string
          source?: string
          updated_at?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: []
      }
      disposal_config: {
        Row: {
          id: string
          retention_days: number
          singleton: boolean
        }
        Insert: {
          id?: string
          retention_days?: number
          singleton?: boolean
        }
        Update: {
          id?: string
          retention_days?: number
          singleton?: boolean
        }
        Relationships: []
      }
      document_counters: {
        Row: {
          code: string
          next_seq: number
        }
        Insert: {
          code: string
          next_seq?: number
        }
        Update: {
          code?: string
          next_seq?: number
        }
        Relationships: []
      }
      document_records: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          document_number: string
          id: string
          record_date: string
          seq_number: number
          source_id: string
          source_table: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          document_number: string
          id?: string
          record_date: string
          seq_number: number
          source_id: string
          source_table: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          document_number?: string
          id?: string
          record_date?: string
          seq_number?: number
          source_id?: string
          source_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_records_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "document_counters"
            referencedColumns: ["code"]
          },
        ]
      }
      export_config: {
        Row: {
          api_key: string
          id: string
          include_calibration: boolean
          include_ccv: boolean
          include_lcs: boolean
          include_method_blank: boolean
          is_active: boolean
          updated_at: string
          updated_by: string | null
          webhook_url: string | null
        }
        Insert: {
          api_key?: string
          id?: string
          include_calibration?: boolean
          include_ccv?: boolean
          include_lcs?: boolean
          include_method_blank?: boolean
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_key?: string
          id?: string
          include_calibration?: boolean
          include_ccv?: boolean
          include_lcs?: boolean
          include_method_blank?: boolean
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      export_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          id: string
          last_error: string | null
          payload: Json | null
          sample_id: string | null
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          payload?: Json | null
          sample_id?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          payload?: Json | null
          sample_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_deliveries_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      hplc_columns: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          installed_at: string | null
          installed_on_instrument_id: string | null
          is_active: boolean
          name: string
          part_number: string | null
          rated_max_pressure_bar: number | null
          source_receipt_id: string | null
          total_injections: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          installed_at?: string | null
          installed_on_instrument_id?: string | null
          is_active?: boolean
          name: string
          part_number?: string | null
          rated_max_pressure_bar?: number | null
          source_receipt_id?: string | null
          total_injections?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          installed_at?: string | null
          installed_on_instrument_id?: string | null
          is_active?: boolean
          name?: string
          part_number?: string | null
          rated_max_pressure_bar?: number | null
          source_receipt_id?: string | null
          total_injections?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hplc_columns_installed_on_instrument_id_fkey"
            columns: ["installed_on_instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      instrument_bookings: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          instrument_id: string
          notes: string | null
          purpose: string
          starts_at: string
          updated_at: string
          user_id: string
          user_name: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          instrument_id: string
          notes?: string | null
          purpose: string
          starts_at: string
          updated_at?: string
          user_id: string
          user_name: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          instrument_id?: string
          notes?: string | null
          purpose?: string
          starts_at?: string
          updated_at?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "instrument_bookings_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      instruments: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inventory_components: {
        Row: {
          created_at: string
          description: string | null
          id: string
          installation_date: string | null
          installer_initials: string | null
          is_spare: boolean
          item_id: string
          lot_number: string | null
          make: string | null
          model: string | null
          part_number: string | null
          position: number
          purchase_date: string | null
          serial_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          installation_date?: string | null
          installer_initials?: string | null
          is_spare?: boolean
          item_id: string
          lot_number?: string | null
          make?: string | null
          model?: string | null
          part_number?: string | null
          position?: number
          purchase_date?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          installation_date?: string | null
          installer_initials?: string | null
          is_spare?: boolean
          item_id?: string
          lot_number?: string | null
          make?: string | null
          model?: string | null
          part_number?: string | null
          position?: number
          purchase_date?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_components_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          default_method_folder: string | null
          description: string | null
          drive_methods_folder_id: string | null
          drive_reports_folder_id: string | null
          drive_sequences_folder_id: string | null
          id: string
          installation_date: string | null
          installer_initials: string | null
          instrument_name: string | null
          instrument_status:
            | Database["public"]["Enums"]["instrument_op_status"]
            | null
          is_spare: boolean
          lot_number: string | null
          make: string | null
          model: string | null
          part_number: string | null
          purchase_date: string | null
          serial_number: string | null
          status: string
          tray_config_id: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          default_method_folder?: string | null
          description?: string | null
          drive_methods_folder_id?: string | null
          drive_reports_folder_id?: string | null
          drive_sequences_folder_id?: string | null
          id?: string
          installation_date?: string | null
          installer_initials?: string | null
          instrument_name?: string | null
          instrument_status?:
            | Database["public"]["Enums"]["instrument_op_status"]
            | null
          is_spare?: boolean
          lot_number?: string | null
          make?: string | null
          model?: string | null
          part_number?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          status?: string
          tray_config_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          default_method_folder?: string | null
          description?: string | null
          drive_methods_folder_id?: string | null
          drive_reports_folder_id?: string | null
          drive_sequences_folder_id?: string | null
          id?: string
          installation_date?: string | null
          installer_initials?: string | null
          instrument_name?: string | null
          instrument_status?:
            | Database["public"]["Enums"]["instrument_op_status"]
            | null
          is_spare?: boolean
          lot_number?: string | null
          make?: string | null
          model?: string | null
          part_number?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          status?: string
          tray_config_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_tray_config_fk"
            columns: ["tray_config_id"]
            isOneToOne: false
            referencedRelation: "tray_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_report_attachments: {
        Row: {
          content_type: string | null
          file_name: string
          file_path: string
          id: string
          issue_id: string
          size_bytes: number | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          file_name: string
          file_path: string
          id?: string
          issue_id: string
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          file_name?: string
          file_path?: string
          id?: string
          issue_id?: string
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issue_report_attachments_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issue_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_reports: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          document_number: string
          id: string
          occurred_at: string
          status: string
          updated_at: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          document_number: string
          id?: string
          occurred_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          user_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          document_number?: string
          id?: string
          occurred_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: []
      }
      lab_journal_attachments: {
        Row: {
          content_type: string | null
          entry_id: string
          file_name: string
          file_path: string
          id: string
          size_bytes: number | null
          uploaded_at: string
          uploaded_by: string | null
          user_id: string
        }
        Insert: {
          content_type?: string | null
          entry_id: string
          file_name: string
          file_path: string
          id?: string
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          user_id: string
        }
        Update: {
          content_type?: string | null
          entry_id?: string
          file_name?: string
          file_path?: string
          id?: string
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_journal_attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "lab_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_journal_entries: {
        Row: {
          body: string
          created_at: string
          entry_at: string
          entry_number: string
          id: string
          tags: string[]
          title: string | null
          updated_at: string
          user_id: string
          user_name: string
        }
        Insert: {
          body?: string
          created_at?: string
          entry_at?: string
          entry_number: string
          id?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id: string
          user_name: string
        }
        Update: {
          body?: string
          created_at?: string
          entry_at?: string
          entry_number?: string
          id?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      library_items: {
        Row: {
          ambiguity_notes: string | null
          cas_number: string | null
          category: string | null
          chemical_formula: string | null
          confidence: string | null
          created_at: string
          created_by: string | null
          id: string
          molecular_size: string | null
          molecular_weight: string | null
          names: string
          notes: string | null
          salt_form: string | null
          sequence: string | null
          size_basis: string | null
          source_url: string | null
          termini_modifications: string | null
          updated_at: string
        }
        Insert: {
          ambiguity_notes?: string | null
          cas_number?: string | null
          category?: string | null
          chemical_formula?: string | null
          confidence?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          molecular_size?: string | null
          molecular_weight?: string | null
          names: string
          notes?: string | null
          salt_form?: string | null
          sequence?: string | null
          size_basis?: string | null
          source_url?: string | null
          termini_modifications?: string | null
          updated_at?: string
        }
        Update: {
          ambiguity_notes?: string | null
          cas_number?: string | null
          category?: string | null
          chemical_formula?: string | null
          confidence?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          molecular_size?: string | null
          molecular_weight?: string | null
          names?: string
          notes?: string | null
          salt_form?: string | null
          sequence?: string | null
          size_basis?: string | null
          source_url?: string | null
          termini_modifications?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      material_receipt_attachments: {
        Row: {
          content_type: string | null
          file_name: string
          file_path: string
          id: string
          kind: Database["public"]["Enums"]["material_receipt_attachment_kind"]
          receipt_id: string
          size_bytes: number | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          file_name: string
          file_path: string
          id?: string
          kind?: Database["public"]["Enums"]["material_receipt_attachment_kind"]
          receipt_id: string
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          file_name?: string
          file_path?: string
          id?: string
          kind?: Database["public"]["Enums"]["material_receipt_attachment_kind"]
          receipt_id?: string
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_receipt_attachments_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "material_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      material_receipts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approver_name: string | null
          catalog_number: string | null
          coa_attached: boolean
          container_details: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          expiry_date: string | null
          freight_tracking_number: string | null
          gl_account: string | null
          id: string
          internal_lot: string | null
          invoice_date: string | null
          invoice_number: string | null
          manufacturer: string | null
          manufacturer_lot: string | null
          material_name: string
          material_type: Database["public"]["Enums"]["material_type"]
          molecular_weight: number | null
          notes: string | null
          po_number: string | null
          purity_percent: number | null
          purpose: string | null
          qc_analyst: string | null
          qc_date: string | null
          qc_pass: boolean | null
          qc_results: string | null
          quantity: number | null
          quarantine_status: Database["public"]["Enums"]["material_quarantine_status"]
          receipt_number: string
          received_at: string
          received_by: string | null
          receiver_name: string
          sds_attached: boolean
          serial_number: string | null
          shelf_life_months: number | null
          shipping_cost: number | null
          storage_location: string | null
          supplier: string | null
          tax_amount: number | null
          temperature_on_receipt: number | null
          total_price: number | null
          unit: string | null
          unit_price: number | null
          updated_at: string
          visual_inspection: string | null
          visual_inspection_notes: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approver_name?: string | null
          catalog_number?: string | null
          coa_attached?: boolean
          container_details?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          expiry_date?: string | null
          freight_tracking_number?: string | null
          gl_account?: string | null
          id?: string
          internal_lot?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          manufacturer?: string | null
          manufacturer_lot?: string | null
          material_name: string
          material_type: Database["public"]["Enums"]["material_type"]
          molecular_weight?: number | null
          notes?: string | null
          po_number?: string | null
          purity_percent?: number | null
          purpose?: string | null
          qc_analyst?: string | null
          qc_date?: string | null
          qc_pass?: boolean | null
          qc_results?: string | null
          quantity?: number | null
          quarantine_status?: Database["public"]["Enums"]["material_quarantine_status"]
          receipt_number?: string
          received_at?: string
          received_by?: string | null
          receiver_name: string
          sds_attached?: boolean
          serial_number?: string | null
          shelf_life_months?: number | null
          shipping_cost?: number | null
          storage_location?: string | null
          supplier?: string | null
          tax_amount?: number | null
          temperature_on_receipt?: number | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
          visual_inspection?: string | null
          visual_inspection_notes?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approver_name?: string | null
          catalog_number?: string | null
          coa_attached?: boolean
          container_details?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          expiry_date?: string | null
          freight_tracking_number?: string | null
          gl_account?: string | null
          id?: string
          internal_lot?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          manufacturer?: string | null
          manufacturer_lot?: string | null
          material_name?: string
          material_type?: Database["public"]["Enums"]["material_type"]
          molecular_weight?: number | null
          notes?: string | null
          po_number?: string | null
          purity_percent?: number | null
          purpose?: string | null
          qc_analyst?: string | null
          qc_date?: string | null
          qc_pass?: boolean | null
          qc_results?: string | null
          quantity?: number | null
          quarantine_status?: Database["public"]["Enums"]["material_quarantine_status"]
          receipt_number?: string
          received_at?: string
          received_by?: string | null
          receiver_name?: string
          sds_attached?: boolean
          serial_number?: string | null
          shelf_life_months?: number | null
          shipping_cost?: number | null
          storage_location?: string | null
          supplier?: string | null
          tax_amount?: number | null
          temperature_on_receipt?: number | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
          visual_inspection?: string | null
          visual_inspection_notes?: string | null
        }
        Relationships: []
      }
      material_suggestions: {
        Row: {
          catalog_number: string | null
          created_at: string
          id: string
          is_active: boolean
          manufacturer: string | null
          material_type: Database["public"]["Enums"]["material_type"]
          name: string
        }
        Insert: {
          catalog_number?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          manufacturer?: string | null
          material_type: Database["public"]["Enums"]["material_type"]
          name: string
        }
        Update: {
          catalog_number?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          manufacturer?: string | null
          material_type?: Database["public"]["Enums"]["material_type"]
          name?: string
        }
        Relationships: []
      }
      method_groups: {
        Row: {
          created_at: string
          default_acquisition_method: string | null
          default_processing_method: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          priority: number
          temperature_c: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_acquisition_method?: string | null
          default_processing_method?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          priority: number
          temperature_c: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_acquisition_method?: string | null
          default_processing_method?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          temperature_c?: number
          updated_at?: string
        }
        Relationships: []
      }
      mobile_phase_prep_counters: {
        Row: {
          day: string
          last_seq: number
        }
        Insert: {
          day: string
          last_seq?: number
        }
        Update: {
          day?: string
          last_seq?: number
        }
        Relationships: []
      }
      mobile_phase_prep_logs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          log_number: string
          lot_number: string
          prep_a: Json
          prep_b: Json
          preparation: string
          prepared_at: string
          total_volume: number
          total_volume_unit: string
          updated_at: string
          user_id: string | null
          user_initials: string
          user_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          log_number?: string
          lot_number: string
          prep_a?: Json
          prep_b?: Json
          preparation?: string
          prepared_at?: string
          total_volume: number
          total_volume_unit?: string
          updated_at?: string
          user_id?: string | null
          user_initials: string
          user_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          log_number?: string
          lot_number?: string
          prep_a?: Json
          prep_b?: Json
          preparation?: string
          prepared_at?: string
          total_volume?: number
          total_volume_unit?: string
          updated_at?: string
          user_id?: string | null
          user_initials?: string
          user_name?: string
        }
        Relationships: []
      }
      mobile_phase_reagents: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          kinds: string[]
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          kinds?: string[]
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          kinds?: string[]
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      modifier_options: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      nc_candidate_residues: {
        Row: {
          candidate_id: string
          candidate_kind: string
          id: string
          residue_index: number
        }
        Insert: {
          candidate_id: string
          candidate_kind: string
          id?: string
          residue_index: number
        }
        Update: {
          candidate_id?: string
          candidate_kind?: string
          id?: string
          residue_index?: number
        }
        Relationships: []
      }
      nc_compounds: {
        Row: {
          amino_acid_composition: string | null
          cas_number: string | null
          class: string | null
          compound_id: string | null
          created_at: string
          dad_guidance: string | null
          dad_primary: string | null
          dad_secondary: string | null
          form_notes: string | null
          id: string
          key_chromophores: string | null
          molecular_formula: string | null
          monoisotopic_mass: number | null
          mz_1plus: number | null
          mz_2plus: number | null
          name: string
          review_flag: string | null
          sequence_composition: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          amino_acid_composition?: string | null
          cas_number?: string | null
          class?: string | null
          compound_id?: string | null
          created_at?: string
          dad_guidance?: string | null
          dad_primary?: string | null
          dad_secondary?: string | null
          form_notes?: string | null
          id?: string
          key_chromophores?: string | null
          molecular_formula?: string | null
          monoisotopic_mass?: number | null
          mz_1plus?: number | null
          mz_2plus?: number | null
          name: string
          review_flag?: string | null
          sequence_composition?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          amino_acid_composition?: string | null
          cas_number?: string | null
          class?: string | null
          compound_id?: string | null
          created_at?: string
          dad_guidance?: string | null
          dad_primary?: string | null
          dad_secondary?: string | null
          form_notes?: string | null
          id?: string
          key_chromophores?: string | null
          molecular_formula?: string | null
          monoisotopic_mass?: number | null
          mz_1plus?: number | null
          mz_2plus?: number | null
          name?: string
          review_flag?: string | null
          sequence_composition?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nc_compounds_compound_id_fkey"
            columns: ["compound_id"]
            isOneToOne: false
            referencedRelation: "compounds"
            referencedColumns: ["id"]
          },
        ]
      }
      nc_detection_rules: {
        Row: {
          applies_to: string | null
          candidate_product: string | null
          created_at: string
          dad_behavior: string | null
          discriminator: string | null
          evidence_level: string | null
          formula_delta: string | null
          guardrail: string | null
          id: string
          kind: string
          mass_delta: number | null
          notes: string | null
          rp_hplc_behavior: string | null
          rule_id: string
          source_url: string | null
          trigger_feature: string | null
        }
        Insert: {
          applies_to?: string | null
          candidate_product?: string | null
          created_at?: string
          dad_behavior?: string | null
          discriminator?: string | null
          evidence_level?: string | null
          formula_delta?: string | null
          guardrail?: string | null
          id?: string
          kind: string
          mass_delta?: number | null
          notes?: string | null
          rp_hplc_behavior?: string | null
          rule_id: string
          source_url?: string | null
          trigger_feature?: string | null
        }
        Update: {
          applies_to?: string | null
          candidate_product?: string | null
          created_at?: string
          dad_behavior?: string | null
          discriminator?: string | null
          evidence_level?: string | null
          formula_delta?: string | null
          guardrail?: string | null
          id?: string
          kind?: string
          mass_delta?: number | null
          notes?: string | null
          rp_hplc_behavior?: string | null
          rule_id?: string
          source_url?: string | null
          trigger_feature?: string | null
        }
        Relationships: []
      }
      nc_evaluation_findings: {
        Row: {
          adduct: string | null
          analyst_note: string | null
          applied_evidence_rules: Json
          area_pct: number | null
          candidate_kind: string | null
          component_scores: Json
          created_at: string
          evaluation_id: string
          id: string
          matched_candidate_id: string | null
          observed_mz: number | null
          observed_neutral_mass: number | null
          peak_id: string | null
          peak_purity: number | null
          peak_purity_passed: boolean | null
          rationale: string | null
          rt: number | null
          spectral_detail: Json | null
          tier: string
          uv_match: number | null
        }
        Insert: {
          adduct?: string | null
          analyst_note?: string | null
          applied_evidence_rules?: Json
          area_pct?: number | null
          candidate_kind?: string | null
          component_scores?: Json
          created_at?: string
          evaluation_id: string
          id?: string
          matched_candidate_id?: string | null
          observed_mz?: number | null
          observed_neutral_mass?: number | null
          peak_id?: string | null
          peak_purity?: number | null
          peak_purity_passed?: boolean | null
          rationale?: string | null
          rt?: number | null
          spectral_detail?: Json | null
          tier: string
          uv_match?: number | null
        }
        Update: {
          adduct?: string | null
          analyst_note?: string | null
          applied_evidence_rules?: Json
          area_pct?: number | null
          candidate_kind?: string | null
          component_scores?: Json
          created_at?: string
          evaluation_id?: string
          id?: string
          matched_candidate_id?: string | null
          observed_mz?: number | null
          observed_neutral_mass?: number | null
          peak_id?: string | null
          peak_purity?: number | null
          peak_purity_passed?: boolean | null
          rationale?: string | null
          rt?: number | null
          spectral_detail?: Json | null
          tier?: string
          uv_match?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nc_evaluation_findings_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "nc_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      nc_evaluations: {
        Row: {
          created_at: string
          document_number: string
          dx_file_id: string | null
          dx_folder_id: string | null
          dx_match_confidence: string | null
          id: string
          nc_compound_id: string | null
          overall_tier: string | null
          result_id: string | null
          run_at: string
          run_by: string | null
          run_by_name: string
          sample_id: string | null
          stress_context: string | null
          summary: string | null
        }
        Insert: {
          created_at?: string
          document_number: string
          dx_file_id?: string | null
          dx_folder_id?: string | null
          dx_match_confidence?: string | null
          id?: string
          nc_compound_id?: string | null
          overall_tier?: string | null
          result_id?: string | null
          run_at?: string
          run_by?: string | null
          run_by_name: string
          sample_id?: string | null
          stress_context?: string | null
          summary?: string | null
        }
        Update: {
          created_at?: string
          document_number?: string
          dx_file_id?: string | null
          dx_folder_id?: string | null
          dx_match_confidence?: string | null
          id?: string
          nc_compound_id?: string | null
          overall_tier?: string | null
          result_id?: string | null
          run_at?: string
          run_by?: string | null
          run_by_name?: string
          sample_id?: string | null
          stress_context?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nc_evaluations_nc_compound_id_fkey"
            columns: ["nc_compound_id"]
            isOneToOne: false
            referencedRelation: "nc_compounds"
            referencedColumns: ["id"]
          },
        ]
      }
      nc_evidence_rules: {
        Row: {
          created_at: string
          id: string
          interpretation_guardrail: string | null
          observation: string
          rule_id: string
          suggested_score_effect: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          interpretation_guardrail?: string | null
          observation: string
          rule_id: string
          suggested_score_effect?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          interpretation_guardrail?: string | null
          observation?: string
          rule_id?: string
          suggested_score_effect?: string | null
        }
        Relationships: []
      }
      nc_impurity_candidates: {
        Row: {
          category: string | null
          created_at: string
          dad_discriminator: string | null
          dad_primary: string | null
          dad_secondary: string | null
          evidence_level: string | null
          formation_pathway: string | null
          formula_delta: string | null
          id: string
          impurity_code: string
          lc_ms_discriminator: string | null
          likely_trigger: string | null
          mass_delta: number | null
          molecular_formula: string | null
          monoisotopic_mass: number | null
          mz_1plus: number | null
          mz_2plus: number | null
          name: string
          nc_compound_id: string
          notes: string | null
          rp_hplc_behavior: string | null
          source_url: string | null
          structure_change: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          dad_discriminator?: string | null
          dad_primary?: string | null
          dad_secondary?: string | null
          evidence_level?: string | null
          formation_pathway?: string | null
          formula_delta?: string | null
          id?: string
          impurity_code: string
          lc_ms_discriminator?: string | null
          likely_trigger?: string | null
          mass_delta?: number | null
          molecular_formula?: string | null
          monoisotopic_mass?: number | null
          mz_1plus?: number | null
          mz_2plus?: number | null
          name: string
          nc_compound_id: string
          notes?: string | null
          rp_hplc_behavior?: string | null
          source_url?: string | null
          structure_change?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          dad_discriminator?: string | null
          dad_primary?: string | null
          dad_secondary?: string | null
          evidence_level?: string | null
          formation_pathway?: string | null
          formula_delta?: string | null
          id?: string
          impurity_code?: string
          lc_ms_discriminator?: string | null
          likely_trigger?: string | null
          mass_delta?: number | null
          molecular_formula?: string | null
          monoisotopic_mass?: number | null
          mz_1plus?: number | null
          mz_2plus?: number | null
          name?: string
          nc_compound_id?: string
          notes?: string | null
          rp_hplc_behavior?: string | null
          source_url?: string | null
          structure_change?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nc_impurity_candidates_nc_compound_id_fkey"
            columns: ["nc_compound_id"]
            isOneToOne: false
            referencedRelation: "nc_compounds"
            referencedColumns: ["id"]
          },
        ]
      }
      nc_oligomer_candidates: {
        Row: {
          best_orthogonal_discriminator: string | null
          class: string | null
          created_at: string
          dad_discriminator: string | null
          evidence_level: string | null
          expected_normalized_dad: string | null
          false_positive_warning: string | null
          id: string
          lc_ms_discriminator: string | null
          mass_delta_vs_n_monomer: number | null
          mechanism_pathway: string | null
          molecular_formula: string | null
          monoisotopic_mass: number | null
          mz_1plus: number | null
          mz_2plus: number | null
          name: string
          nc_compound_id: string
          notes: string | null
          oligomer_code: string
          other_diagnostic_ions: string | null
          rp_hplc_behavior: string | null
          source_url: string | null
          stoichiometry: string | null
          trigger_motif: string | null
        }
        Insert: {
          best_orthogonal_discriminator?: string | null
          class?: string | null
          created_at?: string
          dad_discriminator?: string | null
          evidence_level?: string | null
          expected_normalized_dad?: string | null
          false_positive_warning?: string | null
          id?: string
          lc_ms_discriminator?: string | null
          mass_delta_vs_n_monomer?: number | null
          mechanism_pathway?: string | null
          molecular_formula?: string | null
          monoisotopic_mass?: number | null
          mz_1plus?: number | null
          mz_2plus?: number | null
          name: string
          nc_compound_id: string
          notes?: string | null
          oligomer_code: string
          other_diagnostic_ions?: string | null
          rp_hplc_behavior?: string | null
          source_url?: string | null
          stoichiometry?: string | null
          trigger_motif?: string | null
        }
        Update: {
          best_orthogonal_discriminator?: string | null
          class?: string | null
          created_at?: string
          dad_discriminator?: string | null
          evidence_level?: string | null
          expected_normalized_dad?: string | null
          false_positive_warning?: string | null
          id?: string
          lc_ms_discriminator?: string | null
          mass_delta_vs_n_monomer?: number | null
          mechanism_pathway?: string | null
          molecular_formula?: string | null
          monoisotopic_mass?: number | null
          mz_1plus?: number | null
          mz_2plus?: number | null
          name?: string
          nc_compound_id?: string
          notes?: string | null
          oligomer_code?: string
          other_diagnostic_ions?: string | null
          rp_hplc_behavior?: string | null
          source_url?: string | null
          stoichiometry?: string | null
          trigger_motif?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nc_oligomer_candidates_nc_compound_id_fkey"
            columns: ["nc_compound_id"]
            isOneToOne: false
            referencedRelation: "nc_compounds"
            referencedColumns: ["id"]
          },
        ]
      }
      nc_spectral_panels: {
        Row: {
          created_at: string
          id: string
          important_note: string | null
          nc_compound_id: string
          panel_rationale: string | null
          parent_dad_guidance: string | null
          recommended_features: string | null
          recommended_range: string | null
          wavelengths_nm: number[]
        }
        Insert: {
          created_at?: string
          id?: string
          important_note?: string | null
          nc_compound_id: string
          panel_rationale?: string | null
          parent_dad_guidance?: string | null
          recommended_features?: string | null
          recommended_range?: string | null
          wavelengths_nm: number[]
        }
        Update: {
          created_at?: string
          id?: string
          important_note?: string | null
          nc_compound_id?: string
          panel_rationale?: string | null
          parent_dad_guidance?: string | null
          recommended_features?: string | null
          recommended_range?: string | null
          wavelengths_nm?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "nc_spectral_panels_nc_compound_id_fkey"
            columns: ["nc_compound_id"]
            isOneToOne: false
            referencedRelation: "nc_compounds"
            referencedColumns: ["id"]
          },
        ]
      }
      nc_structures: {
        Row: {
          atom_count: number | null
          atoms: Json
          bonds: Json
          created_at: string
          generation_source: string | null
          id: string
          nc_compound_id: string
          notes: string | null
          residues: Json
          variant_id: string | null
          variant_kind: string
        }
        Insert: {
          atom_count?: number | null
          atoms: Json
          bonds?: Json
          created_at?: string
          generation_source?: string | null
          id?: string
          nc_compound_id: string
          notes?: string | null
          residues?: Json
          variant_id?: string | null
          variant_kind: string
        }
        Update: {
          atom_count?: number | null
          atoms?: Json
          bonds?: Json
          created_at?: string
          generation_source?: string | null
          id?: string
          nc_compound_id?: string
          notes?: string | null
          residues?: Json
          variant_id?: string | null
          variant_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "nc_structures_nc_compound_id_fkey"
            columns: ["nc_compound_id"]
            isOneToOne: false
            referencedRelation: "nc_compounds"
            referencedColumns: ["id"]
          },
        ]
      }
      nonchrom_results: {
        Row: {
          analysis_date: string
          analyst_id: string | null
          approved_at: string | null
          created_at: string
          data: Json
          id: string
          reviewed_at: string | null
          reviewer_id: string | null
          test_id: string
          test_type: Database["public"]["Enums"]["test_type"]
          updated_at: string
        }
        Insert: {
          analysis_date?: string
          analyst_id?: string | null
          approved_at?: string | null
          created_at?: string
          data?: Json
          id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          test_id: string
          test_type: Database["public"]["Enums"]["test_type"]
          updated_at?: string
        }
        Update: {
          analysis_date?: string
          analyst_id?: string | null
          approved_at?: string | null
          created_at?: string
          data?: Json
          id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          test_id?: string
          test_type?: Database["public"]["Enums"]["test_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nonchrom_results_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      nonchrom_test_attachments: {
        Row: {
          content_type: string | null
          file_name: string
          file_path: string
          id: string
          kind: Database["public"]["Enums"]["nonchrom_attachment_kind"]
          size_bytes: number | null
          test_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          file_name: string
          file_path: string
          id?: string
          kind?: Database["public"]["Enums"]["nonchrom_attachment_kind"]
          size_bytes?: number | null
          test_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          file_name?: string
          file_path?: string
          id?: string
          kind?: Database["public"]["Enums"]["nonchrom_attachment_kind"]
          size_bytes?: number | null
          test_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nonchrom_test_attachments_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_recipients: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notify_email: boolean
          notify_sms: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notify_email?: boolean
          notify_sms?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notify_email?: boolean
          notify_sms?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      openlab_drive_pushes: {
        Row: {
          drive_file_id: string
          drive_file_name: string
          id: string
          pushed_at: string
          pushed_by: string | null
          run_list_id: string
        }
        Insert: {
          drive_file_id: string
          drive_file_name: string
          id?: string
          pushed_at?: string
          pushed_by?: string | null
          run_list_id: string
        }
        Update: {
          drive_file_id?: string
          drive_file_name?: string
          id?: string
          pushed_at?: string
          pushed_by?: string | null
          run_list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "openlab_drive_pushes_run_list_id_fkey"
            columns: ["run_list_id"]
            isOneToOne: false
            referencedRelation: "run_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      openlab_methods: {
        Row: {
          description: string | null
          id: string
          instrument_id: string | null
          last_modified: string | null
          name: string
          relative_path: string
          size_bytes: number | null
          synced_at: string
        }
        Insert: {
          description?: string | null
          id?: string
          instrument_id?: string | null
          last_modified?: string | null
          name: string
          relative_path: string
          size_bytes?: number | null
          synced_at?: string
        }
        Update: {
          description?: string | null
          id?: string
          instrument_id?: string | null
          last_modified?: string | null
          name?: string
          relative_path?: string
          size_bytes?: number | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "openlab_methods_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      openlab_reports: {
        Row: {
          id: string
          instrument_id: string | null
          last_modified: string | null
          name: string
          relative_path: string
          size_bytes: number | null
          synced_at: string
        }
        Insert: {
          id?: string
          instrument_id?: string | null
          last_modified?: string | null
          name: string
          relative_path: string
          size_bytes?: number | null
          synced_at?: string
        }
        Update: {
          id?: string
          instrument_id?: string | null
          last_modified?: string | null
          name?: string
          relative_path?: string
          size_bytes?: number | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "openlab_reports_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      openlab_sequences: {
        Row: {
          id: string
          instrument_id: string | null
          last_modified: string | null
          line_count: number
          name: string
          relative_path: string
          status: string
          synced_at: string
        }
        Insert: {
          id?: string
          instrument_id?: string | null
          last_modified?: string | null
          line_count?: number
          name: string
          relative_path: string
          status?: string
          synced_at?: string
        }
        Update: {
          id?: string
          instrument_id?: string | null
          last_modified?: string | null
          line_count?: number
          name?: string
          relative_path?: string
          status?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "openlab_sequences_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      openlab_settings: {
        Row: {
          created_at: string
          drive_last_pulled_at: string | null
          drive_last_pushed_at: string | null
          drive_methods_folder_id: string | null
          drive_reports_folder_id: string | null
          drive_sequences_folder_id: string | null
          id: string
          last_synced_at: string | null
          notes: string | null
          project_folder_path: string
          singleton: boolean
          storage_prefix: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          drive_last_pulled_at?: string | null
          drive_last_pushed_at?: string | null
          drive_methods_folder_id?: string | null
          drive_reports_folder_id?: string | null
          drive_sequences_folder_id?: string | null
          id?: string
          last_synced_at?: string | null
          notes?: string | null
          project_folder_path?: string
          singleton?: boolean
          storage_prefix?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          drive_last_pulled_at?: string | null
          drive_last_pushed_at?: string | null
          drive_methods_folder_id?: string | null
          drive_reports_folder_id?: string | null
          drive_sequences_folder_id?: string | null
          id?: string
          last_synced_at?: string | null
          notes?: string | null
          project_folder_path?: string
          singleton?: boolean
          storage_prefix?: string
          updated_at?: string
        }
        Relationships: []
      }
      parameter_scouting_attachments: {
        Row: {
          content_type: string | null
          entry_id: string
          file_name: string
          file_path: string
          id: string
          size_bytes: number | null
          uploaded_at: string
          uploaded_by: string | null
          user_id: string
        }
        Insert: {
          content_type?: string | null
          entry_id: string
          file_name: string
          file_path: string
          id?: string
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          user_id: string
        }
        Update: {
          content_type?: string | null
          entry_id?: string
          file_name?: string
          file_path?: string
          id?: string
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parameter_scouting_attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "parameter_scouting_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      parameter_scouting_logs: {
        Row: {
          comments: string | null
          created_at: string
          created_by: string | null
          flow_rate_ml_per_min: number | null
          gradient: Json
          id: string
          mobile_phase_a: string
          mobile_phase_b: string
          run_at: string
          run_list: Json
          sample_diluent: string | null
          temperature_c: number | null
          updated_at: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          created_by?: string | null
          flow_rate_ml_per_min?: number | null
          gradient?: Json
          id?: string
          mobile_phase_a?: string
          mobile_phase_b?: string
          run_at?: string
          run_list?: Json
          sample_diluent?: string | null
          temperature_c?: number | null
          updated_at?: string
          user_id?: string | null
          user_name: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          created_by?: string | null
          flow_rate_ml_per_min?: number | null
          gradient?: Json
          id?: string
          mobile_phase_a?: string
          mobile_phase_b?: string
          run_at?: string
          run_list?: Json
          sample_diluent?: string | null
          temperature_c?: number | null
          updated_at?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: []
      }
      partner_webhook_secrets: {
        Row: {
          created_at: string
          created_by: string | null
          deprecated_at: string | null
          grace_until: string | null
          id: string
          last_verified_at: string | null
          secret: string
          secret_preview: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deprecated_at?: string | null
          grace_until?: string | null
          id?: string
          last_verified_at?: string | null
          secret: string
          secret_preview: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deprecated_at?: string | null
          grace_until?: string | null
          id?: string
          last_verified_at?: string | null
          secret?: string
          secret_preview?: string
          status?: string
        }
        Relationships: []
      }
      pending_order_samples: {
        Row: {
          created_at: string
          external_sample_id: string | null
          id: string
          line_index: number
          lot_batch: string | null
          notes: string | null
          pending_order_id: string
          product_name: string
          quantity: number
        }
        Insert: {
          created_at?: string
          external_sample_id?: string | null
          id?: string
          line_index: number
          lot_batch?: string | null
          notes?: string | null
          pending_order_id: string
          product_name: string
          quantity?: number
        }
        Update: {
          created_at?: string
          external_sample_id?: string | null
          id?: string
          line_index?: number
          lot_batch?: string | null
          notes?: string | null
          pending_order_id?: string
          product_name?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "pending_order_samples_pending_order_id_fkey"
            columns: ["pending_order_id"]
            isOneToOne: false
            referencedRelation: "pending_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_orders: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          carrier: string | null
          created_at: string
          customer_company: string | null
          customer_email: string | null
          customer_external_id: string | null
          customer_name: string | null
          expected_arrival: string | null
          external_order_id: string
          id: string
          linked_coc_id: string | null
          order_date: string | null
          raw_payload: Json
          received_at: string | null
          received_by: string | null
          reserved_sample_id: string | null
          special_instructions: string | null
          status: string
          total_samples: number | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          carrier?: string | null
          created_at?: string
          customer_company?: string | null
          customer_email?: string | null
          customer_external_id?: string | null
          customer_name?: string | null
          expected_arrival?: string | null
          external_order_id: string
          id?: string
          linked_coc_id?: string | null
          order_date?: string | null
          raw_payload: Json
          received_at?: string | null
          received_by?: string | null
          reserved_sample_id?: string | null
          special_instructions?: string | null
          status?: string
          total_samples?: number | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          carrier?: string | null
          created_at?: string
          customer_company?: string | null
          customer_email?: string | null
          customer_external_id?: string | null
          customer_name?: string | null
          expected_arrival?: string | null
          external_order_id?: string
          id?: string
          linked_coc_id?: string | null
          order_date?: string | null
          raw_payload?: Json
          received_at?: string | null
          received_by?: string | null
          reserved_sample_id?: string | null
          special_instructions?: string | null
          status?: string
          total_samples?: number | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_orders_linked_coc_id_fkey"
            columns: ["linked_coc_id"]
            isOneToOne: false
            referencedRelation: "chain_of_custody_records"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id: string
          last_name?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          title?: string | null
        }
        Relationships: []
      }
      queue_config: {
        Row: {
          approaching_threshold_pct: number
          business_days_only: boolean
          daily_capacity: number
          id: boolean
          tat_days: number
          updated_at: string
        }
        Insert: {
          approaching_threshold_pct?: number
          business_days_only?: boolean
          daily_capacity?: number
          id?: boolean
          tat_days?: number
          updated_at?: string
        }
        Update: {
          approaching_threshold_pct?: number
          business_days_only?: boolean
          daily_capacity?: number
          id?: boolean
          tat_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      report_reconciliation_failures: {
        Row: {
          created_at: string
          error: string
          file_id: string
          file_name: string
          id: string
          sample_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error: string
          file_id: string
          file_name: string
          id?: string
          sample_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error?: string
          file_id?: string
          file_name?: string
          id?: string
          sample_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_reconciliation_failures_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      results: {
        Row: {
          analysis_date: string
          analyst_id: string | null
          approved_at: string | null
          calibration_data: Json | null
          calibration_curves: Json | null
          calibration_image: string | null
          chromatogram_image: string | null
          created_at: string
          id: string
          peak_details: Json | null
          purity_percentage: number | null
          raw_data_file_path: string | null
          report_metadata: Json | null
          reviewed_at: string | null
          reviewer_id: string | null
          test_id: string
          updated_at: string
          uv_conf_match: number | null
          wavelength_nm: number | null
        }
        Insert: {
          analysis_date?: string
          analyst_id?: string | null
          approved_at?: string | null
          calibration_data?: Json | null
          calibration_curves?: Json | null
          calibration_image?: string | null
          chromatogram_image?: string | null
          created_at?: string
          id?: string
          peak_details?: Json | null
          purity_percentage?: number | null
          raw_data_file_path?: string | null
          report_metadata?: Json | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          test_id: string
          updated_at?: string
          uv_conf_match?: number | null
          wavelength_nm?: number | null
        }
        Update: {
          analysis_date?: string
          analyst_id?: string | null
          approved_at?: string | null
          calibration_data?: Json | null
          calibration_curves?: Json | null
          calibration_image?: string | null
          chromatogram_image?: string | null
          created_at?: string
          id?: string
          peak_details?: Json | null
          purity_percentage?: number | null
          raw_data_file_path?: string | null
          report_metadata?: Json | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          test_id?: string
          updated_at?: string
          uv_conf_match?: number | null
          wavelength_nm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "results_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      review_config: {
        Row: {
          allow_self_review: boolean
          id: boolean
          updated_at: string
        }
        Insert: {
          allow_self_review?: boolean
          id?: boolean
          updated_at?: string
        }
        Update: {
          allow_self_review?: boolean
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      run_list_bench_sheets: {
        Row: {
          created_at: string
          deviation_flag: boolean
          deviation_notes: string | null
          document_number: string
          id: string
          narrative: string | null
          performed_at: string | null
          performed_by: string | null
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          run_completed_at: string | null
          run_list_id: string
          run_started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deviation_flag?: boolean
          deviation_notes?: string | null
          document_number: string
          id?: string
          narrative?: string | null
          performed_at?: string | null
          performed_by?: string | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_completed_at?: string | null
          run_list_id: string
          run_started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deviation_flag?: boolean
          deviation_notes?: string | null
          document_number?: string
          id?: string
          narrative?: string | null
          performed_at?: string | null
          performed_by?: string | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_completed_at?: string | null
          run_list_id?: string
          run_started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_list_bench_sheets_run_list_id_fkey"
            columns: ["run_list_id"]
            isOneToOne: true
            referencedRelation: "run_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      run_list_columns: {
        Row: {
          created_at: string
          default_value: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          sample_field: string | null
          sort_order: number
          source: Database["public"]["Enums"]["run_list_column_source"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_value?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          sample_field?: string | null
          sort_order?: number
          source?: Database["public"]["Enums"]["run_list_column_source"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_value?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sample_field?: string | null
          sort_order?: number
          source?: Database["public"]["Enums"]["run_list_column_source"]
          updated_at?: string
        }
        Relationships: []
      }
      run_list_daily_counters: {
        Row: {
          day: string
          instrument_key: string
          last_seq: number
        }
        Insert: {
          day: string
          instrument_key: string
          last_seq?: number
        }
        Update: {
          day?: string
          instrument_key?: string
          last_seq?: number
        }
        Relationships: []
      }
      run_list_items: {
        Row: {
          accession_number: number | null
          comment: string | null
          created_at: string
          data_file: string | null
          extras: Json
          id: string
          method_override: string | null
          row_no: number
          run_list_id: string
          sample_id: string | null
          sample_type: string
          sp_preparation_record_id: string | null
          standard_prep_id: string | null
          updated_at: string
          vial: number | null
        }
        Insert: {
          accession_number?: number | null
          comment?: string | null
          created_at?: string
          data_file?: string | null
          extras?: Json
          id?: string
          method_override?: string | null
          row_no?: number
          run_list_id: string
          sample_id?: string | null
          sample_type?: string
          sp_preparation_record_id?: string | null
          standard_prep_id?: string | null
          updated_at?: string
          vial?: number | null
        }
        Update: {
          accession_number?: number | null
          comment?: string | null
          created_at?: string
          data_file?: string | null
          extras?: Json
          id?: string
          method_override?: string | null
          row_no?: number
          run_list_id?: string
          sample_id?: string | null
          sample_type?: string
          sp_preparation_record_id?: string | null
          standard_prep_id?: string | null
          updated_at?: string
          vial?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "run_list_items_run_list_id_fkey"
            columns: ["run_list_id"]
            isOneToOne: false
            referencedRelation: "run_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_list_items_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_list_items_sp_preparation_record_id_fkey"
            columns: ["sp_preparation_record_id"]
            isOneToOne: false
            referencedRelation: "sp_preparation_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_list_items_standard_prep_id_fkey"
            columns: ["standard_prep_id"]
            isOneToOne: false
            referencedRelation: "standard_preparation_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      run_lists: {
        Row: {
          created_at: string
          created_by: string | null
          csv_storage_path: string | null
          data_file_pattern: string
          document_number: string
          exported_at: string | null
          exported_by: string | null
          id: string
          inj_per_vial: number
          instrument_id: string | null
          method_name: string | null
          name: string
          notes: string | null
          starting_vial: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          csv_storage_path?: string | null
          data_file_pattern?: string
          document_number: string
          exported_at?: string | null
          exported_by?: string | null
          id?: string
          inj_per_vial?: number
          instrument_id?: string | null
          method_name?: string | null
          name: string
          notes?: string | null
          starting_vial?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          csv_storage_path?: string | null
          data_file_pattern?: string
          document_number?: string
          exported_at?: string | null
          exported_by?: string | null
          id?: string
          inj_per_vial?: number
          instrument_id?: string | null
          method_name?: string | null
          name?: string
          notes?: string | null
          starting_vial?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_lists_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_locations: {
        Row: {
          assigned_at: string
          created_at: string
          disposed_at: string | null
          disposed_by: string | null
          id: string
          location: string
          location_type: string
          notes: string | null
          removed_at: string | null
          sample_id: string
          status: string
          storage_slot_id: string | null
          tray_position_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          created_at?: string
          disposed_at?: string | null
          disposed_by?: string | null
          id?: string
          location: string
          location_type: string
          notes?: string | null
          removed_at?: string | null
          sample_id: string
          status?: string
          storage_slot_id?: string | null
          tray_position_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          created_at?: string
          disposed_at?: string | null
          disposed_by?: string | null
          id?: string
          location?: string
          location_type?: string
          notes?: string | null
          removed_at?: string | null
          sample_id?: string
          status?: string
          storage_slot_id?: string | null
          tray_position_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_locations_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_locations_storage_slot_id_fkey"
            columns: ["storage_slot_id"]
            isOneToOne: false
            referencedRelation: "storage_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_locations_tray_position_id_fkey"
            columns: ["tray_position_id"]
            isOneToOne: false
            referencedRelation: "tray_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      samples: {
        Row: {
          actual_completion_date: string | null
          assigned_analysis_date: string | null
          batch_id: string
          catalog: string | null
          client: string
          client_id: string | null
          client_received_date: string | null
          coc_id: string | null
          coc_line_no: number | null
          components: Json
          compound: string | null
          compound_id: string | null
          concentration: string | null
          container_size: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          is_multi_component: boolean
          label_content_unit: string | null
          label_content_value: number | null
          line_item_index: number | null
          lot: string | null
          manufacture_date: string | null
          method_group_id: string | null
          notes: string | null
          parameters: string[]
          partner_reported_compound_name: string | null
          physical_description: string | null
          physical_form: string | null
          physical_form_details: Json | null
          prep_flag: boolean
          prep_flagged_at: string | null
          prep_flagged_by: string | null
          priority: number
          project: string | null
          purity_waived: boolean
          purity_waived_at: string | null
          purity_waived_by: string | null
          raw_data_file_path: string | null
          receipt_date: string
          received_form: string | null
          received_purity_percent: number | null
          received_quantity: number | null
          received_quantity_unit: string | null
          status: Database["public"]["Enums"]["sample_status"]
          temperature_c: number | null
          updated_at: string
        }
        Insert: {
          actual_completion_date?: string | null
          assigned_analysis_date?: string | null
          batch_id: string
          catalog?: string | null
          client: string
          client_id?: string | null
          client_received_date?: string | null
          coc_id?: string | null
          coc_line_no?: number | null
          components?: Json
          compound?: string | null
          compound_id?: string | null
          concentration?: string | null
          container_size?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          is_multi_component?: boolean
          label_content_unit?: string | null
          label_content_value?: number | null
          line_item_index?: number | null
          lot?: string | null
          manufacture_date?: string | null
          method_group_id?: string | null
          notes?: string | null
          parameters?: string[]
          partner_reported_compound_name?: string | null
          physical_description?: string | null
          physical_form?: string | null
          physical_form_details?: Json | null
          prep_flag?: boolean
          prep_flagged_at?: string | null
          prep_flagged_by?: string | null
          priority?: number
          project?: string | null
          purity_waived?: boolean
          purity_waived_at?: string | null
          purity_waived_by?: string | null
          raw_data_file_path?: string | null
          receipt_date?: string
          received_form?: string | null
          received_purity_percent?: number | null
          received_quantity?: number | null
          received_quantity_unit?: string | null
          status?: Database["public"]["Enums"]["sample_status"]
          temperature_c?: number | null
          updated_at?: string
        }
        Update: {
          actual_completion_date?: string | null
          assigned_analysis_date?: string | null
          batch_id?: string
          catalog?: string | null
          client?: string
          client_id?: string | null
          client_received_date?: string | null
          coc_id?: string | null
          coc_line_no?: number | null
          components?: Json
          compound?: string | null
          compound_id?: string | null
          concentration?: string | null
          container_size?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          is_multi_component?: boolean
          label_content_unit?: string | null
          label_content_value?: number | null
          line_item_index?: number | null
          lot?: string | null
          manufacture_date?: string | null
          method_group_id?: string | null
          notes?: string | null
          parameters?: string[]
          partner_reported_compound_name?: string | null
          physical_description?: string | null
          physical_form?: string | null
          physical_form_details?: Json | null
          prep_flag?: boolean
          prep_flagged_at?: string | null
          prep_flagged_by?: string | null
          priority?: number
          project?: string | null
          purity_waived?: boolean
          purity_waived_at?: string | null
          purity_waived_by?: string | null
          raw_data_file_path?: string | null
          receipt_date?: string
          received_form?: string | null
          received_purity_percent?: number | null
          received_quantity?: number | null
          received_quantity_unit?: string | null
          status?: Database["public"]["Enums"]["sample_status"]
          temperature_c?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "samples_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_coc_id_fkey"
            columns: ["coc_id"]
            isOneToOne: false
            referencedRelation: "chain_of_custody_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_compound_id_fkey"
            columns: ["compound_id"]
            isOneToOne: false
            referencedRelation: "compounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_method_group_id_fkey"
            columns: ["method_group_id"]
            isOneToOne: false
            referencedRelation: "method_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      sftp_config: {
        Row: {
          host: string
          id: string
          is_active: boolean
          password: string | null
          port: number
          private_key: string | null
          remote_path: string
          updated_at: string
          updated_by: string | null
          username: string
        }
        Insert: {
          host?: string
          id?: string
          is_active?: boolean
          password?: string | null
          port?: number
          private_key?: string | null
          remote_path?: string
          updated_at?: string
          updated_by?: string | null
          username?: string
        }
        Update: {
          host?: string
          id?: string
          is_active?: boolean
          password?: string | null
          port?: number
          private_key?: string | null
          remote_path?: string
          updated_at?: string
          updated_by?: string | null
          username?: string
        }
        Relationships: []
      }
      solvent_options: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      sp_analyte_aliases: {
        Row: {
          alias: string
          analyte_id: string
          created_at: string
          id: string
        }
        Insert: {
          alias: string
          analyte_id: string
          created_at?: string
          id?: string
        }
        Update: {
          alias?: string
          analyte_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sp_analyte_aliases_analyte_id_fkey"
            columns: ["analyte_id"]
            isOneToOne: false
            referencedRelation: "sp_analytes"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_analytes: {
        Row: {
          abbreviation: string | null
          canonical_name: string
          cas_number: string | null
          category: string | null
          created_at: string
          created_by: string | null
          default_concentration_unit: string | null
          default_mass_unit: string | null
          default_solvent_recommendations: string | null
          description: string | null
          handling_notes: string | null
          id: string
          is_active: boolean
          molecular_formula: string | null
          molecular_weight: number | null
          salt_form: string | null
          sequence: string | null
          solubility_notes: string | null
          stability_notes: string | null
          storage_notes: string | null
          updated_at: string
        }
        Insert: {
          abbreviation?: string | null
          canonical_name: string
          cas_number?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          default_concentration_unit?: string | null
          default_mass_unit?: string | null
          default_solvent_recommendations?: string | null
          description?: string | null
          handling_notes?: string | null
          id?: string
          is_active?: boolean
          molecular_formula?: string | null
          molecular_weight?: number | null
          salt_form?: string | null
          sequence?: string | null
          solubility_notes?: string | null
          stability_notes?: string | null
          storage_notes?: string | null
          updated_at?: string
        }
        Update: {
          abbreviation?: string | null
          canonical_name?: string
          cas_number?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          default_concentration_unit?: string | null
          default_mass_unit?: string | null
          default_solvent_recommendations?: string | null
          description?: string | null
          handling_notes?: string | null
          id?: string
          is_active?: boolean
          molecular_formula?: string | null
          molecular_weight?: number | null
          salt_form?: string | null
          sequence?: string | null
          solubility_notes?: string | null
          stability_notes?: string | null
          storage_notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sp_equipment: {
        Row: {
          accuracy: string | null
          calibration_date: string | null
          calibration_due_date: string | null
          calibration_status: string | null
          capacity_unit: string | null
          created_at: string
          equipment_id: string | null
          equipment_type: string
          id: string
          is_active: boolean
          location: string | null
          manufacturer: string | null
          max_capacity: number | null
          min_capacity: number | null
          model: string | null
          notes: string | null
          preferred_max: number | null
          preferred_min: number | null
          resolution: number | null
          serial_number: string | null
          uncertainty: string | null
          updated_at: string
        }
        Insert: {
          accuracy?: string | null
          calibration_date?: string | null
          calibration_due_date?: string | null
          calibration_status?: string | null
          capacity_unit?: string | null
          created_at?: string
          equipment_id?: string | null
          equipment_type: string
          id?: string
          is_active?: boolean
          location?: string | null
          manufacturer?: string | null
          max_capacity?: number | null
          min_capacity?: number | null
          model?: string | null
          notes?: string | null
          preferred_max?: number | null
          preferred_min?: number | null
          resolution?: number | null
          serial_number?: string | null
          uncertainty?: string | null
          updated_at?: string
        }
        Update: {
          accuracy?: string | null
          calibration_date?: string | null
          calibration_due_date?: string | null
          calibration_status?: string | null
          capacity_unit?: string | null
          created_at?: string
          equipment_id?: string | null
          equipment_type?: string
          id?: string
          is_active?: boolean
          location?: string | null
          manufacturer?: string | null
          max_capacity?: number | null
          min_capacity?: number | null
          model?: string | null
          notes?: string | null
          preferred_max?: number | null
          preferred_min?: number | null
          resolution?: number | null
          serial_number?: string | null
          uncertainty?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sp_method_calibration_levels: {
        Row: {
          acceptance_notes: string | null
          concentration_unit: string | null
          created_at: string
          dilution_factor: number | null
          id: string
          include_in_calibration: boolean
          is_active: boolean
          level_number: number
          preparation_source: string | null
          regression_model: string | null
          replicate_count: number | null
          revision_id: string
          standard_name: string | null
          target_concentration: number | null
          updated_at: string
          weighting_model: string | null
        }
        Insert: {
          acceptance_notes?: string | null
          concentration_unit?: string | null
          created_at?: string
          dilution_factor?: number | null
          id?: string
          include_in_calibration?: boolean
          is_active?: boolean
          level_number: number
          preparation_source?: string | null
          regression_model?: string | null
          replicate_count?: number | null
          revision_id: string
          standard_name?: string | null
          target_concentration?: number | null
          updated_at?: string
          weighting_model?: string | null
        }
        Update: {
          acceptance_notes?: string | null
          concentration_unit?: string | null
          created_at?: string
          dilution_factor?: number | null
          id?: string
          include_in_calibration?: boolean
          is_active?: boolean
          level_number?: number
          preparation_source?: string | null
          regression_model?: string | null
          replicate_count?: number | null
          revision_id?: string
          standard_name?: string | null
          target_concentration?: number | null
          updated_at?: string
          weighting_model?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sp_method_calibration_levels_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "sp_method_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_method_gradient_steps: {
        Row: {
          created_at: string
          curve_type: string | null
          flow_rate: number | null
          id: string
          ordinal: number
          pct_a: number | null
          pct_b: number | null
          pct_c: number | null
          pct_d: number | null
          revision_id: string
          time_min: number | null
        }
        Insert: {
          created_at?: string
          curve_type?: string | null
          flow_rate?: number | null
          id?: string
          ordinal: number
          pct_a?: number | null
          pct_b?: number | null
          pct_c?: number | null
          pct_d?: number | null
          revision_id: string
          time_min?: number | null
        }
        Update: {
          created_at?: string
          curve_type?: string | null
          flow_rate?: number | null
          id?: string
          ordinal?: number
          pct_a?: number | null
          pct_b?: number | null
          pct_c?: number | null
          pct_d?: number | null
          revision_id?: string
          time_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sp_method_gradient_steps_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "sp_method_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_method_mobile_phases: {
        Row: {
          channel: string
          composition_text: string | null
          created_at: string
          id: string
          initial_percent: number | null
          revision_id: string
        }
        Insert: {
          channel: string
          composition_text?: string | null
          created_at?: string
          id?: string
          initial_percent?: number | null
          revision_id: string
        }
        Update: {
          channel?: string
          composition_text?: string | null
          created_at?: string
          id?: string
          initial_percent?: number | null
          revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sp_method_mobile_phases_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "sp_method_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_method_prep_rules: {
        Row: {
          allow_direct: boolean
          allow_gravimetric: boolean
          allow_serial: boolean
          allow_volumetric: boolean
          allowed_sample_solvent_ids: string[] | null
          allowed_vial_size_ids: string[] | null
          centrifugation_instructions: string | null
          created_at: string
          default_sample_solvent_id: string | null
          default_stock_concentration: number | null
          default_stock_concentration_unit: string | null
          default_target_level: number
          filter_pore_um: number | null
          filter_type: string | null
          filtration_instructions: string | null
          light_protection: boolean | null
          max_concentration_deviation_pct: number | null
          max_dilution_steps: number | null
          max_hold_time: string | null
          max_initial_reconstitution_volume_ul: number | null
          max_pipette_volume_ul: number | null
          min_initial_reconstitution_volume_ul: number | null
          min_pipette_volume_ul: number | null
          mixing_instructions: string | null
          preferred_final_volume_ul: number | null
          preferred_initial_reconstitution_volume_ul: number | null
          preferred_min_pipette_volume_ul: number | null
          revision_id: string
          safety_notes: string | null
          sonication_instructions: string | null
          special_handling: string | null
          stability_notes: string | null
          storage_temp_c: number | null
          updated_at: string
        }
        Insert: {
          allow_direct?: boolean
          allow_gravimetric?: boolean
          allow_serial?: boolean
          allow_volumetric?: boolean
          allowed_sample_solvent_ids?: string[] | null
          allowed_vial_size_ids?: string[] | null
          centrifugation_instructions?: string | null
          created_at?: string
          default_sample_solvent_id?: string | null
          default_stock_concentration?: number | null
          default_stock_concentration_unit?: string | null
          default_target_level?: number
          filter_pore_um?: number | null
          filter_type?: string | null
          filtration_instructions?: string | null
          light_protection?: boolean | null
          max_concentration_deviation_pct?: number | null
          max_dilution_steps?: number | null
          max_hold_time?: string | null
          max_initial_reconstitution_volume_ul?: number | null
          max_pipette_volume_ul?: number | null
          min_initial_reconstitution_volume_ul?: number | null
          min_pipette_volume_ul?: number | null
          mixing_instructions?: string | null
          preferred_final_volume_ul?: number | null
          preferred_initial_reconstitution_volume_ul?: number | null
          preferred_min_pipette_volume_ul?: number | null
          revision_id: string
          safety_notes?: string | null
          sonication_instructions?: string | null
          special_handling?: string | null
          stability_notes?: string | null
          storage_temp_c?: number | null
          updated_at?: string
        }
        Update: {
          allow_direct?: boolean
          allow_gravimetric?: boolean
          allow_serial?: boolean
          allow_volumetric?: boolean
          allowed_sample_solvent_ids?: string[] | null
          allowed_vial_size_ids?: string[] | null
          centrifugation_instructions?: string | null
          created_at?: string
          default_sample_solvent_id?: string | null
          default_stock_concentration?: number | null
          default_stock_concentration_unit?: string | null
          default_target_level?: number
          filter_pore_um?: number | null
          filter_type?: string | null
          filtration_instructions?: string | null
          light_protection?: boolean | null
          max_concentration_deviation_pct?: number | null
          max_dilution_steps?: number | null
          max_hold_time?: string | null
          max_initial_reconstitution_volume_ul?: number | null
          max_pipette_volume_ul?: number | null
          min_initial_reconstitution_volume_ul?: number | null
          min_pipette_volume_ul?: number | null
          mixing_instructions?: string | null
          preferred_final_volume_ul?: number | null
          preferred_initial_reconstitution_volume_ul?: number | null
          preferred_min_pipette_volume_ul?: number | null
          revision_id?: string
          safety_notes?: string | null
          sonication_instructions?: string | null
          special_handling?: string | null
          stability_notes?: string | null
          storage_temp_c?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sp_method_prep_rules_default_sample_solvent_id_fkey"
            columns: ["default_sample_solvent_id"]
            isOneToOne: false
            referencedRelation: "sp_solvent_formulations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_method_prep_rules_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: true
            referencedRelation: "sp_method_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_method_revisions: {
        Row: {
          approval_date: string | null
          approved_by: string | null
          autosampler_temp_c: number | null
          bandwidth: number | null
          change_reason: string | null
          column_dimensions: string | null
          column_manufacturer: string | null
          column_name: string | null
          column_part_number: string | null
          column_temp_c: number | null
          created_at: string
          created_by: string | null
          detector_type: string | null
          effective_date: string | null
          estimated_rt_min: number | null
          expected_peak_order: string | null
          flow_rate: number | null
          id: string
          injection_volume_ul: number | null
          instrument_type: string | null
          method_id: string
          needle_wash: string | null
          notes: string | null
          particle_size_um: number | null
          post_run_time_min: number | null
          reference_wavelength: number | null
          reviewed_by: string | null
          revision: number
          rt_window_min: number | null
          seal_wash: string | null
          stationary_phase: string | null
          status: Database["public"]["Enums"]["sp_revision_status"]
          suitability_requirements: string | null
          superseded_date: string | null
          total_run_time_min: number | null
          updated_at: string
          version: number
          wavelengths: Json | null
        }
        Insert: {
          approval_date?: string | null
          approved_by?: string | null
          autosampler_temp_c?: number | null
          bandwidth?: number | null
          change_reason?: string | null
          column_dimensions?: string | null
          column_manufacturer?: string | null
          column_name?: string | null
          column_part_number?: string | null
          column_temp_c?: number | null
          created_at?: string
          created_by?: string | null
          detector_type?: string | null
          effective_date?: string | null
          estimated_rt_min?: number | null
          expected_peak_order?: string | null
          flow_rate?: number | null
          id?: string
          injection_volume_ul?: number | null
          instrument_type?: string | null
          method_id: string
          needle_wash?: string | null
          notes?: string | null
          particle_size_um?: number | null
          post_run_time_min?: number | null
          reference_wavelength?: number | null
          reviewed_by?: string | null
          revision?: number
          rt_window_min?: number | null
          seal_wash?: string | null
          stationary_phase?: string | null
          status?: Database["public"]["Enums"]["sp_revision_status"]
          suitability_requirements?: string | null
          superseded_date?: string | null
          total_run_time_min?: number | null
          updated_at?: string
          version?: number
          wavelengths?: Json | null
        }
        Update: {
          approval_date?: string | null
          approved_by?: string | null
          autosampler_temp_c?: number | null
          bandwidth?: number | null
          change_reason?: string | null
          column_dimensions?: string | null
          column_manufacturer?: string | null
          column_name?: string | null
          column_part_number?: string | null
          column_temp_c?: number | null
          created_at?: string
          created_by?: string | null
          detector_type?: string | null
          effective_date?: string | null
          estimated_rt_min?: number | null
          expected_peak_order?: string | null
          flow_rate?: number | null
          id?: string
          injection_volume_ul?: number | null
          instrument_type?: string | null
          method_id?: string
          needle_wash?: string | null
          notes?: string | null
          particle_size_um?: number | null
          post_run_time_min?: number | null
          reference_wavelength?: number | null
          reviewed_by?: string | null
          revision?: number
          rt_window_min?: number | null
          seal_wash?: string | null
          stationary_phase?: string | null
          status?: Database["public"]["Enums"]["sp_revision_status"]
          suitability_requirements?: string | null
          superseded_date?: string | null
          total_run_time_min?: number | null
          updated_at?: string
          version?: number
          wavelengths?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sp_method_revisions_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "sp_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_methods: {
        Row: {
          analyte_id: string
          code: string | null
          created_at: string
          created_by: string | null
          id: string
          intended_use: string | null
          is_active: boolean
          method_type: string | null
          name: string
          updated_at: string
        }
        Insert: {
          analyte_id: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          intended_use?: string | null
          is_active?: boolean
          method_type?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          analyte_id?: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          intended_use?: string | null
          is_active?: boolean
          method_type?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sp_methods_analyte_id_fkey"
            columns: ["analyte_id"]
            isOneToOne: false
            referencedRelation: "sp_analytes"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_preparation_attachments: {
        Row: {
          content_type: string | null
          file_name: string
          file_path: string
          id: string
          kind: Database["public"]["Enums"]["sp_attachment_kind"]
          record_id: string
          size_bytes: number | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          file_name: string
          file_path: string
          id?: string
          kind?: Database["public"]["Enums"]["sp_attachment_kind"]
          record_id: string
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          file_name?: string
          file_path?: string
          id?: string
          kind?: Database["public"]["Enums"]["sp_attachment_kind"]
          record_id?: string
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sp_preparation_attachments_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "sp_preparation_records"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_preparation_records: {
        Row: {
          analyte_id: string
          created_at: string
          expires_at: string | null
          id: string
          lot_number: string | null
          method_revision_id: string
          notes: string | null
          plan: Json
          planned_calibration_level: number | null
          planned_target_concentration_mg_per_ml: number | null
          planned_target_volume_ul: number | null
          prep_number: string
          prepared_at: string | null
          prepared_by: string
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sample_context: Json
          sample_id: string | null
          solvent_formulation_id: string | null
          status: string
          submitted_at: string | null
          total_dilution_factor: number | null
          updated_at: string
        }
        Insert: {
          analyte_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          lot_number?: string | null
          method_revision_id: string
          notes?: string | null
          plan?: Json
          planned_calibration_level?: number | null
          planned_target_concentration_mg_per_ml?: number | null
          planned_target_volume_ul?: number | null
          prep_number: string
          prepared_at?: string | null
          prepared_by: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sample_context?: Json
          sample_id?: string | null
          solvent_formulation_id?: string | null
          status?: string
          submitted_at?: string | null
          total_dilution_factor?: number | null
          updated_at?: string
        }
        Update: {
          analyte_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          lot_number?: string | null
          method_revision_id?: string
          notes?: string | null
          plan?: Json
          planned_calibration_level?: number | null
          planned_target_concentration_mg_per_ml?: number | null
          planned_target_volume_ul?: number | null
          prep_number?: string
          prepared_at?: string | null
          prepared_by?: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sample_context?: Json
          sample_id?: string | null
          solvent_formulation_id?: string | null
          status?: string
          submitted_at?: string | null
          total_dilution_factor?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sp_preparation_records_analyte_id_fkey"
            columns: ["analyte_id"]
            isOneToOne: false
            referencedRelation: "sp_analytes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_preparation_records_method_revision_id_fkey"
            columns: ["method_revision_id"]
            isOneToOne: false
            referencedRelation: "sp_method_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_preparation_records_solvent_formulation_id_fkey"
            columns: ["solvent_formulation_id"]
            isOneToOne: false
            referencedRelation: "sp_solvent_formulations"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_preparation_steps: {
        Row: {
          actual_conc_mg_per_ml: number | null
          actual_diluent_ul: number | null
          actual_final_volume_ul: number | null
          actual_mass_mg: number | null
          actual_volume_ul: number | null
          balance_id: string | null
          created_at: string
          deviation_flag: boolean
          equipment_id: string | null
          id: string
          kind: string
          notes: string | null
          performed_at: string | null
          performed_by_initials: string | null
          planned: Json
          reagent_lot_id: string | null
          record_id: string
          solvent_lot_id: string | null
          step_no: number
          updated_at: string
          vessel_id: string | null
        }
        Insert: {
          actual_conc_mg_per_ml?: number | null
          actual_diluent_ul?: number | null
          actual_final_volume_ul?: number | null
          actual_mass_mg?: number | null
          actual_volume_ul?: number | null
          balance_id?: string | null
          created_at?: string
          deviation_flag?: boolean
          equipment_id?: string | null
          id?: string
          kind: string
          notes?: string | null
          performed_at?: string | null
          performed_by_initials?: string | null
          planned?: Json
          reagent_lot_id?: string | null
          record_id: string
          solvent_lot_id?: string | null
          step_no: number
          updated_at?: string
          vessel_id?: string | null
        }
        Update: {
          actual_conc_mg_per_ml?: number | null
          actual_diluent_ul?: number | null
          actual_final_volume_ul?: number | null
          actual_mass_mg?: number | null
          actual_volume_ul?: number | null
          balance_id?: string | null
          created_at?: string
          deviation_flag?: boolean
          equipment_id?: string | null
          id?: string
          kind?: string
          notes?: string | null
          performed_at?: string | null
          performed_by_initials?: string | null
          planned?: Json
          reagent_lot_id?: string | null
          record_id?: string
          solvent_lot_id?: string | null
          step_no?: number
          updated_at?: string
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sp_preparation_steps_balance_id_fkey"
            columns: ["balance_id"]
            isOneToOne: false
            referencedRelation: "sp_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_preparation_steps_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "sp_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_preparation_steps_reagent_lot_id_fkey"
            columns: ["reagent_lot_id"]
            isOneToOne: false
            referencedRelation: "sp_reagent_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_preparation_steps_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "sp_preparation_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_preparation_steps_solvent_lot_id_fkey"
            columns: ["solvent_lot_id"]
            isOneToOne: false
            referencedRelation: "sp_reagent_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_preparation_steps_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "sp_vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_reagent_lot_components: {
        Row: {
          actual_quantity: number | null
          component_name: string
          created_at: string
          id: string
          reagent_lot_id: string
          source_lot_number: string | null
          unit: string | null
        }
        Insert: {
          actual_quantity?: number | null
          component_name: string
          created_at?: string
          id?: string
          reagent_lot_id: string
          source_lot_number?: string | null
          unit?: string | null
        }
        Update: {
          actual_quantity?: number | null
          component_name?: string
          created_at?: string
          id?: string
          reagent_lot_id?: string
          source_lot_number?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sp_reagent_lot_components_reagent_lot_id_fkey"
            columns: ["reagent_lot_id"]
            isOneToOne: false
            referencedRelation: "sp_reagent_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_reagent_lots: {
        Row: {
          created_at: string
          expiration_date: string | null
          final_volume: number | null
          final_volume_unit: string | null
          formulation_id: string
          id: string
          lot_number: string
          notes: string | null
          ph: number | null
          preparation_date: string | null
          prepared_by: string | null
          review_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expiration_date?: string | null
          final_volume?: number | null
          final_volume_unit?: string | null
          formulation_id: string
          id?: string
          lot_number: string
          notes?: string | null
          ph?: number | null
          preparation_date?: string | null
          prepared_by?: string | null
          review_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expiration_date?: string | null
          final_volume?: number | null
          final_volume_unit?: string | null
          formulation_id?: string
          id?: string
          lot_number?: string
          notes?: string | null
          ph?: number | null
          preparation_date?: string | null
          prepared_by?: string | null
          review_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sp_reagent_lots_formulation_id_fkey"
            columns: ["formulation_id"]
            isOneToOne: false
            referencedRelation: "sp_solvent_formulations"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_settings: {
        Row: {
          absolute_min_pipette_ul: number
          cron_secret: string
          default_calibration_levels: number
          default_target_level: number
          drive_cal_std_folder_id: string | null
          drive_hplc_results_folder_id: string | null
          drive_lm_reports_complete_folder_id: string | null
          drive_lm_sample_prep_folder_id: string | null
          drive_qc_samples_folder_id: string | null
          id: boolean
          max_dilution_steps: number
          preferred_min_pipette_ul: number
          sterility_day3_check_day: number
          sterility_day7_check_day: number
          sterility_readout_day: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          absolute_min_pipette_ul?: number
          cron_secret?: string
          default_calibration_levels?: number
          default_target_level?: number
          drive_cal_std_folder_id?: string | null
          drive_hplc_results_folder_id?: string | null
          drive_lm_reports_complete_folder_id?: string | null
          drive_lm_sample_prep_folder_id?: string | null
          drive_qc_samples_folder_id?: string | null
          id?: boolean
          max_dilution_steps?: number
          preferred_min_pipette_ul?: number
          sterility_day3_check_day?: number
          sterility_day7_check_day?: number
          sterility_readout_day?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          absolute_min_pipette_ul?: number
          cron_secret?: string
          default_calibration_levels?: number
          default_target_level?: number
          drive_cal_std_folder_id?: string | null
          drive_hplc_results_folder_id?: string | null
          drive_lm_reports_complete_folder_id?: string | null
          drive_lm_sample_prep_folder_id?: string | null
          drive_qc_samples_folder_id?: string | null
          id?: boolean
          max_dilution_steps?: number
          preferred_min_pipette_ul?: number
          sterility_day3_check_day?: number
          sterility_day7_check_day?: number
          sterility_readout_day?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sp_solvent_formulation_components: {
        Row: {
          component_name: string
          created_at: string
          formulation_id: string
          id: string
          notes: string | null
          percentage: number | null
          percentage_basis: string | null
        }
        Insert: {
          component_name: string
          created_at?: string
          formulation_id: string
          id?: string
          notes?: string | null
          percentage?: number | null
          percentage_basis?: string | null
        }
        Update: {
          component_name?: string
          created_at?: string
          formulation_id?: string
          id?: string
          notes?: string | null
          percentage?: number | null
          percentage_basis?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sp_solvent_formulation_components_formulation_id_fkey"
            columns: ["formulation_id"]
            isOneToOne: false
            referencedRelation: "sp_solvent_formulations"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_solvent_formulations: {
        Row: {
          approved_uses: string | null
          created_at: string
          created_by: string | null
          id: string
          internal_code: string | null
          name: string
          notes: string | null
          stability_period_days: number | null
          status: string
          storage_conditions: string | null
          updated_at: string
          version: string | null
        }
        Insert: {
          approved_uses?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          internal_code?: string | null
          name: string
          notes?: string | null
          stability_period_days?: number | null
          status?: string
          storage_conditions?: string | null
          updated_at?: string
          version?: string | null
        }
        Update: {
          approved_uses?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          internal_code?: string | null
          name?: string
          notes?: string | null
          stability_period_days?: number | null
          status?: string
          storage_conditions?: string | null
          updated_at?: string
          version?: string | null
        }
        Relationships: []
      }
      sp_vessels: {
        Row: {
          created_at: string
          graduated: boolean
          id: string
          is_active: boolean
          material: string | null
          max_working_volume_ul: number | null
          min_working_volume_ul: number | null
          name: string
          nominal_capacity_ul: number
          notes: string | null
          reusable: boolean
          updated_at: string
          volumetric: boolean
        }
        Insert: {
          created_at?: string
          graduated?: boolean
          id?: string
          is_active?: boolean
          material?: string | null
          max_working_volume_ul?: number | null
          min_working_volume_ul?: number | null
          name: string
          nominal_capacity_ul: number
          notes?: string | null
          reusable?: boolean
          updated_at?: string
          volumetric?: boolean
        }
        Update: {
          created_at?: string
          graduated?: boolean
          id?: string
          is_active?: boolean
          material?: string | null
          max_working_volume_ul?: number | null
          min_working_volume_ul?: number | null
          name?: string
          nominal_capacity_ul?: number
          notes?: string | null
          reusable?: boolean
          updated_at?: string
          volumetric?: boolean
        }
        Relationships: []
      }
      standard_preparation_attachments: {
        Row: {
          content_type: string | null
          file_name: string
          file_path: string
          id: string
          kind: Database["public"]["Enums"]["standard_prep_attachment_kind"]
          log_id: string
          size_bytes: number | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          file_name: string
          file_path: string
          id?: string
          kind?: Database["public"]["Enums"]["standard_prep_attachment_kind"]
          log_id: string
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          file_name?: string
          file_path?: string
          id?: string
          kind?: Database["public"]["Enums"]["standard_prep_attachment_kind"]
          log_id?: string
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "standard_preparation_attachments_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "standard_preparation_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      standard_preparation_counters: {
        Row: {
          day: string
          last_seq: number
        }
        Insert: {
          day: string
          last_seq?: number
        }
        Update: {
          day?: string
          last_seq?: number
        }
        Relationships: []
      }
      standard_preparation_logs: {
        Row: {
          analyst_id: string | null
          analyst_name: string
          appearance_notes: string | null
          approved_at: string | null
          approver_id: string | null
          approver_name: string | null
          batch_group_id: string | null
          container_label: string | null
          created_at: string
          created_by: string | null
          diluent_solvents: Json | null
          expiration_date: string | null
          expiration_period_code: string | null
          expiration_period_days: number | null
          final_concentration_unit: string | null
          final_concentration_value: number | null
          final_diluent: string | null
          final_volume: string | null
          final_volume_ml: number | null
          id: string
          initial_solvent: string | null
          lifecycle_status: string
          log_number: string
          manufacturer_lot: string | null
          material_overridden: boolean
          material_receipt_id: string | null
          mixing_details: string | null
          modifier_material_receipt_id: string | null
          modifier_percent: number | null
          modifier_type: string | null
          notes: string | null
          parent_prep_id: string | null
          prep_type: string | null
          preparation_instructions: string | null
          preparation_steps: Json
          prepared_at: string
          ref_concentration_mg_per_ml: number | null
          ref_form: string
          ref_lot: string | null
          ref_material_name: string | null
          ref_molecular_weight: number | null
          ref_purity_percent: number | null
          ref_receipt_date: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_name: string | null
          solvent: string | null
          standard_name: string
          status: Database["public"]["Enums"]["standard_prep_status"]
          storage_condition: string | null
          storage_location: string | null
          target_concentration: string | null
          updated_at: string
          volume_remaining_ml: number | null
        }
        Insert: {
          analyst_id?: string | null
          analyst_name: string
          appearance_notes?: string | null
          approved_at?: string | null
          approver_id?: string | null
          approver_name?: string | null
          batch_group_id?: string | null
          container_label?: string | null
          created_at?: string
          created_by?: string | null
          diluent_solvents?: Json | null
          expiration_date?: string | null
          expiration_period_code?: string | null
          expiration_period_days?: number | null
          final_concentration_unit?: string | null
          final_concentration_value?: number | null
          final_diluent?: string | null
          final_volume?: string | null
          final_volume_ml?: number | null
          id?: string
          initial_solvent?: string | null
          lifecycle_status?: string
          log_number?: string
          manufacturer_lot?: string | null
          material_overridden?: boolean
          material_receipt_id?: string | null
          mixing_details?: string | null
          modifier_material_receipt_id?: string | null
          modifier_percent?: number | null
          modifier_type?: string | null
          notes?: string | null
          parent_prep_id?: string | null
          prep_type?: string | null
          preparation_instructions?: string | null
          preparation_steps?: Json
          prepared_at?: string
          ref_concentration_mg_per_ml?: number | null
          ref_form?: string
          ref_lot?: string | null
          ref_material_name?: string | null
          ref_molecular_weight?: number | null
          ref_purity_percent?: number | null
          ref_receipt_date?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          solvent?: string | null
          standard_name: string
          status?: Database["public"]["Enums"]["standard_prep_status"]
          storage_condition?: string | null
          storage_location?: string | null
          target_concentration?: string | null
          updated_at?: string
          volume_remaining_ml?: number | null
        }
        Update: {
          analyst_id?: string | null
          analyst_name?: string
          appearance_notes?: string | null
          approved_at?: string | null
          approver_id?: string | null
          approver_name?: string | null
          batch_group_id?: string | null
          container_label?: string | null
          created_at?: string
          created_by?: string | null
          diluent_solvents?: Json | null
          expiration_date?: string | null
          expiration_period_code?: string | null
          expiration_period_days?: number | null
          final_concentration_unit?: string | null
          final_concentration_value?: number | null
          final_diluent?: string | null
          final_volume?: string | null
          final_volume_ml?: number | null
          id?: string
          initial_solvent?: string | null
          lifecycle_status?: string
          log_number?: string
          manufacturer_lot?: string | null
          material_overridden?: boolean
          material_receipt_id?: string | null
          mixing_details?: string | null
          modifier_material_receipt_id?: string | null
          modifier_percent?: number | null
          modifier_type?: string | null
          notes?: string | null
          parent_prep_id?: string | null
          prep_type?: string | null
          preparation_instructions?: string | null
          preparation_steps?: Json
          prepared_at?: string
          ref_concentration_mg_per_ml?: number | null
          ref_form?: string
          ref_lot?: string | null
          ref_material_name?: string | null
          ref_molecular_weight?: number | null
          ref_purity_percent?: number | null
          ref_receipt_date?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          solvent?: string | null
          standard_name?: string
          status?: Database["public"]["Enums"]["standard_prep_status"]
          storage_condition?: string | null
          storage_location?: string | null
          target_concentration?: string | null
          updated_at?: string
          volume_remaining_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "standard_preparation_logs_material_receipt_id_fkey"
            columns: ["material_receipt_id"]
            isOneToOne: false
            referencedRelation: "material_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standard_preparation_logs_modifier_material_receipt_id_fkey"
            columns: ["modifier_material_receipt_id"]
            isOneToOne: false
            referencedRelation: "material_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standard_preparation_logs_parent_prep_id_fkey"
            columns: ["parent_prep_id"]
            isOneToOne: false
            referencedRelation: "standard_preparation_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      standard_preparation_target_components: {
        Row: {
          compound_id: string | null
          compound_name: string
          concentration_mg_per_ml: number | null
          created_at: string
          id: string
          sort_order: number
          stock_volume_ul: number | null
          target_id: string
        }
        Insert: {
          compound_id?: string | null
          compound_name: string
          concentration_mg_per_ml?: number | null
          created_at?: string
          id?: string
          sort_order?: number
          stock_volume_ul?: number | null
          target_id: string
        }
        Update: {
          compound_id?: string | null
          compound_name?: string
          concentration_mg_per_ml?: number | null
          created_at?: string
          id?: string
          sort_order?: number
          stock_volume_ul?: number | null
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "standard_preparation_target_components_compound_id_fkey"
            columns: ["compound_id"]
            isOneToOne: false
            referencedRelation: "compounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standard_preparation_target_components_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "standard_preparation_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      standard_preparation_targets: {
        Row: {
          calculated_mass_mg: number | null
          calculated_volume_ml: number | null
          created_at: string
          id: string
          name: string | null
          notes: string | null
          prep_id: string
          row_no: number
          target_concentration_mg_per_ml: number | null
          target_concentration_unit: string
          target_volume_ml: number | null
        }
        Insert: {
          calculated_mass_mg?: number | null
          calculated_volume_ml?: number | null
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          prep_id: string
          row_no: number
          target_concentration_mg_per_ml?: number | null
          target_concentration_unit?: string
          target_volume_ml?: number | null
        }
        Update: {
          calculated_mass_mg?: number | null
          calculated_volume_ml?: number | null
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          prep_id?: string
          row_no?: number
          target_concentration_mg_per_ml?: number | null
          target_concentration_unit?: string
          target_volume_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "standard_preparation_targets_prep_id_fkey"
            columns: ["prep_id"]
            isOneToOne: false
            referencedRelation: "standard_preparation_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      standard_preparation_usage_log: {
        Row: {
          actor_id: string | null
          actor_name: string
          created_at: string
          id: string
          notes: string | null
          prep_id: string
          purpose: string | null
          withdrawn_ml: number
        }
        Insert: {
          actor_id?: string | null
          actor_name: string
          created_at?: string
          id?: string
          notes?: string | null
          prep_id: string
          purpose?: string | null
          withdrawn_ml: number
        }
        Update: {
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          id?: string
          notes?: string | null
          prep_id?: string
          purpose?: string | null
          withdrawn_ml?: number
        }
        Relationships: [
          {
            foreignKeyName: "standard_preparation_usage_log_prep_id_fkey"
            columns: ["prep_id"]
            isOneToOne: false
            referencedRelation: "standard_preparation_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      standard_suggestions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          typical_concentration: string | null
          typical_solvent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          typical_concentration?: string | null
          typical_solvent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          typical_concentration?: string | null
          typical_solvent?: string | null
        }
        Relationships: []
      }
      stdlog_counters: {
        Row: {
          day: string
          last_seq: number
        }
        Insert: {
          day: string
          last_seq?: number
        }
        Update: {
          day?: string
          last_seq?: number
        }
        Relationships: []
      }
      storage_slots: {
        Row: {
          created_at: string
          id: string
          label: string
          status: Database["public"]["Enums"]["storage_slot_status"]
          storage_unit_id: string
          tray_number: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          status?: Database["public"]["Enums"]["storage_slot_status"]
          storage_unit_id: string
          tray_number: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          status?: Database["public"]["Enums"]["storage_slot_status"]
          storage_unit_id?: string
          tray_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_slots_storage_unit_id_fkey"
            columns: ["storage_unit_id"]
            isOneToOne: false
            referencedRelation: "storage_units"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_units: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          manufacturer: string | null
          model: string | null
          name: string
          notes: string | null
          serial_number: string | null
          target_temperature_c: number | null
          tray_count: number | null
          unit_type: Database["public"]["Enums"]["storage_unit_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          manufacturer?: string | null
          model?: string | null
          name: string
          notes?: string | null
          serial_number?: string | null
          target_temperature_c?: number | null
          tray_count?: number | null
          unit_type: Database["public"]["Enums"]["storage_unit_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          manufacturer?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          serial_number?: string | null
          target_temperature_c?: number | null
          tray_count?: number | null
          unit_type?: Database["public"]["Enums"]["storage_unit_type"]
          updated_at?: string
        }
        Relationships: []
      }
      syx_batch_id_counter: {
        Row: {
          id: number
          last_number: number
        }
        Insert: {
          id?: number
          last_number: number
        }
        Update: {
          id?: number
          last_number?: number
        }
        Relationships: []
      }
      test_parameters: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          maps_to_test_type: Database["public"]["Enums"]["test_type"] | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          maps_to_test_type?: Database["public"]["Enums"]["test_type"] | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          maps_to_test_type?: Database["public"]["Enums"]["test_type"] | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      tests: {
        Row: {
          assigned_tech: string | null
          created_at: string
          id: string
          instrument: string
          method_name: string
          parameters: Json | null
          sample_id: string
          spec_max: number | null
          spec_min: number | null
          status: Database["public"]["Enums"]["test_status"]
          sub_id: string | null
          test_type: Database["public"]["Enums"]["test_type"]
          updated_at: string
        }
        Insert: {
          assigned_tech?: string | null
          created_at?: string
          id?: string
          instrument?: string
          method_name?: string
          parameters?: Json | null
          sample_id: string
          spec_max?: number | null
          spec_min?: number | null
          status?: Database["public"]["Enums"]["test_status"]
          sub_id?: string | null
          test_type?: Database["public"]["Enums"]["test_type"]
          updated_at?: string
        }
        Update: {
          assigned_tech?: string | null
          created_at?: string
          id?: string
          instrument?: string
          method_name?: string
          parameters?: Json | null
          sample_id?: string
          spec_max?: number | null
          spec_min?: number | null
          status?: Database["public"]["Enums"]["test_status"]
          sub_id?: string | null
          test_type?: Database["public"]["Enums"]["test_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tests_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheet_entries: {
        Row: {
          created_at: string
          duration_hours: number
          end_time: string | null
          entry_date: string
          id: string
          notes: string | null
          project: string
          start_time: string | null
          task_description: string
          updated_at: string
          user_id: string
          user_name: string
        }
        Insert: {
          created_at?: string
          duration_hours: number
          end_time?: string | null
          entry_date: string
          id?: string
          notes?: string | null
          project: string
          start_time?: string | null
          task_description: string
          updated_at?: string
          user_id: string
          user_name: string
        }
        Update: {
          created_at?: string
          duration_hours?: number
          end_time?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          project?: string
          start_time?: string | null
          task_description?: string
          updated_at?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      timesheet_projects: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      tray_configs: {
        Row: {
          created_at: string
          drawer_count: number
          id: string
          is_default: boolean
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          drawer_count?: number
          id?: string
          is_default?: boolean
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          drawer_count?: number
          id?: string
          is_default?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tray_positions: {
        Row: {
          col_num: number | null
          created_at: string
          drawer: string | null
          id: string
          is_ref_vial: boolean
          position_code: string
          row_label: string | null
          status: Database["public"]["Enums"]["tray_position_status"]
          tray_config_id: string
          updated_at: string
        }
        Insert: {
          col_num?: number | null
          created_at?: string
          drawer?: string | null
          id?: string
          is_ref_vial?: boolean
          position_code: string
          row_label?: string | null
          status?: Database["public"]["Enums"]["tray_position_status"]
          tray_config_id: string
          updated_at?: string
        }
        Update: {
          col_num?: number | null
          created_at?: string
          drawer?: string | null
          id?: string
          is_ref_vial?: boolean
          position_code?: string
          row_label?: string | null
          status?: Database["public"]["Enums"]["tray_position_status"]
          tray_config_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tray_positions_tray_config_id_fkey"
            columns: ["tray_config_id"]
            isOneToOne: false
            referencedRelation: "tray_configs"
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
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      discard_standard_prep: {
        Args: { p_actor_name: string; p_prep_id: string; p_reason: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_hplc_column_injections: {
        Args: { p_column_id: string; p_count: number }
        Returns: undefined
      }
      match_ai_knowledge_chunks: {
        Args: {
          match_count?: number
          query_embedding: string
          scope_filter?: string
        }
        Returns: {
          chunk_id: string
          content: string
          doc_id: string
          doc_title: string
          page_number: number
          similarity: number
        }[]
      }
      next_accession_numbers: { Args: { p_count: number }; Returns: number[] }
      next_analysis_batch_seq: {
        Args: { p_test_type: string }
        Returns: number
      }
      next_coc_invoice_number: { Args: never; Returns: string }
      next_mobile_phase_prep_number: { Args: never; Returns: string }
      next_run_list_seq: {
        Args: { p_day: string; p_instrument_key: string }
        Returns: number
      }
      next_document_number: {
        Args: { p_code: string; p_date?: string }
        Returns: string
      }
      next_stdlog_lot: { Args: never; Returns: string }
      record_standard_usage: {
        Args: {
          p_actor_id: string
          p_actor_name: string
          p_notes: string
          p_prep_id: string
          p_purpose: string
          p_withdrawn_ml: number
        }
        Returns: number
      }
      register_document: {
        Args: { p_code: string; p_created_by?: string; p_date?: string; p_source_id: string; p_source_table: string }
        Returns: string
      }
      sp_child_writable: { Args: { _rev: string }; Returns: boolean }
      trigger_cal_qc_watcher: { Args: never; Returns: undefined }
      trigger_incubation_watcher: { Args: never; Returns: undefined }
      trigger_pressure_log_watcher: { Args: never; Returns: undefined }
      trigger_report_reconciliation: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "tech" | "reviewer"
      coc_field_type:
        | "text"
        | "textarea"
        | "number"
        | "date"
        | "datetime"
        | "email"
        | "tel"
        | "multiselect"
      instrument_op_status: "active" | "maintenance" | "inactive"
      material_quarantine_status: "quarantine" | "released" | "rejected"
      material_receipt_attachment_kind:
        | "coa"
        | "sds"
        | "packing_slip"
        | "label"
        | "photo"
        | "other"
      material_type: "controlled" | "uncontrolled"
      nonchrom_attachment_kind: "lab_report" | "coa" | "other"
      run_list_column_source:
        | "literal"
        | "sample_field"
        | "method"
        | "vial"
        | "data_file_pattern"
      sample_status:
        | "received"
        | "in_progress"
        | "reviewed"
        | "approved"
        | "intake_verified"
        | "prep"
        | "complete"
        | "scheduled"
        | "in_analysis"
        | "on_hold"
        | "cancelled"
      sp_attachment_kind:
        | "weighing"
        | "label"
        | "photo"
        | "sequence"
        | "coa"
        | "other"
      sp_revision_status:
        | "draft"
        | "under_review"
        | "approved"
        | "superseded"
        | "retired"
      standard_prep_attachment_kind:
        | "weighing"
        | "label"
        | "photo"
        | "sequence"
        | "coa"
        | "other"
      standard_prep_status: "draft" | "reviewed" | "approved"
      storage_slot_status: "available" | "occupied" | "out_of_service"
      storage_unit_type: "fridge" | "freezer" | "incubator" | "autoclave"
      test_status: "pending" | "running" | "completed" | "failed"
      test_type: "purity" | "sterility" | "endotoxin" | "heavy_metals"
      tray_position_status: "available" | "reserved" | "out_of_service"
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
      app_role: ["admin", "tech", "reviewer"],
      coc_field_type: [
        "text",
        "textarea",
        "number",
        "date",
        "datetime",
        "email",
        "tel",
        "multiselect",
      ],
      instrument_op_status: ["active", "maintenance", "inactive"],
      material_quarantine_status: ["quarantine", "released", "rejected"],
      material_receipt_attachment_kind: [
        "coa",
        "sds",
        "packing_slip",
        "label",
        "photo",
        "other",
      ],
      material_type: ["controlled", "uncontrolled"],
      nonchrom_attachment_kind: ["lab_report", "coa", "other"],
      run_list_column_source: [
        "literal",
        "sample_field",
        "method",
        "vial",
        "data_file_pattern",
      ],
      sample_status: [
        "received",
        "in_progress",
        "reviewed",
        "approved",
        "intake_verified",
        "prep",
        "complete",
        "scheduled",
        "in_analysis",
        "on_hold",
        "cancelled",
      ],
      sp_attachment_kind: [
        "weighing",
        "label",
        "photo",
        "sequence",
        "coa",
        "other",
      ],
      sp_revision_status: [
        "draft",
        "under_review",
        "approved",
        "superseded",
        "retired",
      ],
      standard_prep_attachment_kind: [
        "weighing",
        "label",
        "photo",
        "sequence",
        "coa",
        "other",
      ],
      standard_prep_status: ["draft", "reviewed", "approved"],
      storage_slot_status: ["available", "occupied", "out_of_service"],
      storage_unit_type: ["fridge", "freezer", "incubator", "autoclave"],
      test_status: ["pending", "running", "completed", "failed"],
      test_type: ["purity", "sterility", "endotoxin", "heavy_metals"],
      tray_position_status: ["available", "reserved", "out_of_service"],
    },
  },
} as const
