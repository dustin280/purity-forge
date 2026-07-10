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
      compounds: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_backpressure_logs: {
        Row: {
          backpressure: number
          backpressure_unit: string
          column_name: string | null
          column_temp: number | null
          column_temp_unit: string | null
          created_at: string
          created_by: string | null
          flow_rate: number | null
          flow_rate_unit: string | null
          id: string
          injections_count: number | null
          instrument: string
          mobile_phase: string | null
          notes: string | null
          reading_at: string
          updated_at: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          backpressure: number
          backpressure_unit?: string
          column_name?: string | null
          column_temp?: number | null
          column_temp_unit?: string | null
          created_at?: string
          created_by?: string | null
          flow_rate?: number | null
          flow_rate_unit?: string | null
          id?: string
          injections_count?: number | null
          instrument?: string
          mobile_phase?: string | null
          notes?: string | null
          reading_at?: string
          updated_at?: string
          user_id?: string | null
          user_name: string
        }
        Update: {
          backpressure?: number
          backpressure_unit?: string
          column_name?: string | null
          column_temp?: number | null
          column_temp_unit?: string | null
          created_at?: string
          created_by?: string | null
          flow_rate?: number | null
          flow_rate_unit?: string | null
          id?: string
          injections_count?: number | null
          instrument?: string
          mobile_phase?: string | null
          notes?: string | null
          reading_at?: string
          updated_at?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: []
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
          is_active: boolean
          name: string
          part_number: string | null
          source_receipt_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          part_number?: string | null
          source_receipt_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          part_number?: string | null
          source_receipt_id?: string | null
          updated_at?: string
        }
        Relationships: []
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
          description: string | null
          id: string
          installation_date: string | null
          installer_initials: string | null
          is_spare: boolean
          lot_number: string | null
          make: string | null
          model: string | null
          part_number: string | null
          purchase_date: string | null
          serial_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          installation_date?: string | null
          installer_initials?: string | null
          is_spare?: boolean
          lot_number?: string | null
          make?: string | null
          model?: string | null
          part_number?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          installation_date?: string | null
          installer_initials?: string | null
          is_spare?: boolean
          lot_number?: string | null
          make?: string | null
          model?: string | null
          part_number?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      material_receipt_counters: {
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
          last_modified: string | null
          name: string
          relative_path: string
          size_bytes: number | null
          synced_at: string
        }
        Insert: {
          description?: string | null
          id?: string
          last_modified?: string | null
          name: string
          relative_path: string
          size_bytes?: number | null
          synced_at?: string
        }
        Update: {
          description?: string | null
          id?: string
          last_modified?: string | null
          name?: string
          relative_path?: string
          size_bytes?: number | null
          synced_at?: string
        }
        Relationships: []
      }
      openlab_reports: {
        Row: {
          id: string
          last_modified: string | null
          name: string
          relative_path: string
          size_bytes: number | null
          synced_at: string
        }
        Insert: {
          id?: string
          last_modified?: string | null
          name: string
          relative_path: string
          size_bytes?: number | null
          synced_at?: string
        }
        Update: {
          id?: string
          last_modified?: string | null
          name?: string
          relative_path?: string
          size_bytes?: number | null
          synced_at?: string
        }
        Relationships: []
      }
      openlab_sequences: {
        Row: {
          id: string
          last_modified: string | null
          line_count: number
          name: string
          relative_path: string
          status: string
          synced_at: string
        }
        Insert: {
          id?: string
          last_modified?: string | null
          line_count?: number
          name: string
          relative_path: string
          status?: string
          synced_at?: string
        }
        Update: {
          id?: string
          last_modified?: string | null
          line_count?: number
          name?: string
          relative_path?: string
          status?: string
          synced_at?: string
        }
        Relationships: []
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
      results: {
        Row: {
          analysis_date: string
          analyst_id: string | null
          approved_at: string | null
          created_at: string
          id: string
          peak_details: Json | null
          purity_percentage: number | null
          raw_data_file_path: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          test_id: string
          updated_at: string
        }
        Insert: {
          analysis_date?: string
          analyst_id?: string | null
          approved_at?: string | null
          created_at?: string
          id?: string
          peak_details?: Json | null
          purity_percentage?: number | null
          raw_data_file_path?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          test_id: string
          updated_at?: string
        }
        Update: {
          analysis_date?: string
          analyst_id?: string | null
          approved_at?: string | null
          created_at?: string
          id?: string
          peak_details?: Json | null
          purity_percentage?: number | null
          raw_data_file_path?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          test_id?: string
          updated_at?: string
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
      run_list_items: {
        Row: {
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
          updated_at: string
          vial: number | null
        }
        Insert: {
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
          updated_at?: string
          vial?: number | null
        }
        Update: {
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
        ]
      }
      run_lists: {
        Row: {
          created_at: string
          created_by: string | null
          csv_storage_path: string | null
          data_file_pattern: string
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
      samples: {
        Row: {
          batch_id: string
          catalog: string | null
          client: string
          client_received_date: string | null
          coc_id: string | null
          coc_line_no: number | null
          compound: string | null
          concentration: string | null
          container_size: string | null
          created_at: string
          created_by: string | null
          id: string
          line_item_index: number | null
          lot: string | null
          manufacture_date: string | null
          notes: string | null
          parameters: string[]
          physical_description: string | null
          prep_flag: boolean
          prep_flagged_at: string | null
          prep_flagged_by: string | null
          project: string | null
          raw_data_file_path: string | null
          receipt_date: string
          status: Database["public"]["Enums"]["sample_status"]
          temperature_c: number | null
          updated_at: string
        }
        Insert: {
          batch_id: string
          catalog?: string | null
          client: string
          client_received_date?: string | null
          coc_id?: string | null
          coc_line_no?: number | null
          compound?: string | null
          concentration?: string | null
          container_size?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          line_item_index?: number | null
          lot?: string | null
          manufacture_date?: string | null
          notes?: string | null
          parameters?: string[]
          physical_description?: string | null
          prep_flag?: boolean
          prep_flagged_at?: string | null
          prep_flagged_by?: string | null
          project?: string | null
          raw_data_file_path?: string | null
          receipt_date?: string
          status?: Database["public"]["Enums"]["sample_status"]
          temperature_c?: number | null
          updated_at?: string
        }
        Update: {
          batch_id?: string
          catalog?: string | null
          client?: string
          client_received_date?: string | null
          coc_id?: string | null
          coc_line_no?: number | null
          compound?: string | null
          concentration?: string | null
          container_size?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          line_item_index?: number | null
          lot?: string | null
          manufacture_date?: string | null
          notes?: string | null
          parameters?: string[]
          physical_description?: string | null
          prep_flag?: boolean
          prep_flagged_at?: string | null
          prep_flagged_by?: string | null
          project?: string | null
          raw_data_file_path?: string | null
          receipt_date?: string
          status?: Database["public"]["Enums"]["sample_status"]
          temperature_c?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "samples_coc_id_fkey"
            columns: ["coc_id"]
            isOneToOne: false
            referencedRelation: "chain_of_custody_records"
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
          expiration_date: string | null
          expiration_period_code: string | null
          expiration_period_days: number | null
          final_diluent: string | null
          final_volume: string | null
          id: string
          initial_solvent: string | null
          log_number: string
          manufacturer_lot: string | null
          material_overridden: boolean
          material_receipt_id: string | null
          mixing_details: string | null
          modifier_percent: number | null
          notes: string | null
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
          syn_id: string | null
          target_concentration: string | null
          updated_at: string
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
          expiration_date?: string | null
          expiration_period_code?: string | null
          expiration_period_days?: number | null
          final_diluent?: string | null
          final_volume?: string | null
          id?: string
          initial_solvent?: string | null
          log_number?: string
          manufacturer_lot?: string | null
          material_overridden?: boolean
          material_receipt_id?: string | null
          mixing_details?: string | null
          modifier_percent?: number | null
          notes?: string | null
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
          syn_id?: string | null
          target_concentration?: string | null
          updated_at?: string
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
          expiration_date?: string | null
          expiration_period_code?: string | null
          expiration_period_days?: number | null
          final_diluent?: string | null
          final_volume?: string | null
          id?: string
          initial_solvent?: string | null
          log_number?: string
          manufacturer_lot?: string | null
          material_overridden?: boolean
          material_receipt_id?: string | null
          mixing_details?: string | null
          modifier_percent?: number | null
          notes?: string | null
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
          syn_id?: string | null
          target_concentration?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "standard_preparation_logs_material_receipt_id_fkey"
            columns: ["material_receipt_id"]
            isOneToOne: false
            referencedRelation: "material_receipts"
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
      syn_id_counters: {
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
      test_parameters: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
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
          status: Database["public"]["Enums"]["test_status"]
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
          status?: Database["public"]["Enums"]["test_status"]
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
          status?: Database["public"]["Enums"]["test_status"]
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      next_material_receipt_number: { Args: never; Returns: string }
      next_mobile_phase_prep_number: { Args: never; Returns: string }
      next_standard_preparation_number: { Args: never; Returns: string }
      next_syn_id: {
        Args: { p_day: string; p_user_token: string }
        Returns: string
      }
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
      material_quarantine_status: "quarantine" | "released" | "rejected"
      material_receipt_attachment_kind:
        | "coa"
        | "sds"
        | "packing_slip"
        | "label"
        | "photo"
        | "other"
      material_type: "controlled" | "uncontrolled"
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
      standard_prep_attachment_kind:
        | "weighing"
        | "label"
        | "photo"
        | "sequence"
        | "coa"
        | "other"
      standard_prep_status: "draft" | "reviewed" | "approved"
      test_status: "pending" | "running" | "completed" | "failed"
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
      test_status: ["pending", "running", "completed", "failed"],
    },
  },
} as const
