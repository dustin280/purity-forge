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
      daily_backpressure_logs: {
        Row: {
          backpressure: number
          backpressure_unit: string
          created_at: string
          created_by: string | null
          id: string
          instrument: string
          notes: string | null
          reading_at: string
          updated_at: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          backpressure: number
          backpressure_unit?: string
          created_at?: string
          created_by?: string | null
          id?: string
          instrument?: string
          notes?: string | null
          reading_at?: string
          updated_at?: string
          user_id?: string | null
          user_name: string
        }
        Update: {
          backpressure?: number
          backpressure_unit?: string
          created_at?: string
          created_by?: string | null
          id?: string
          instrument?: string
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
          expiry_date: string | null
          freight_tracking_number: string | null
          id: string
          internal_lot: string | null
          manufacturer: string | null
          manufacturer_lot: string | null
          material_name: string
          material_type: Database["public"]["Enums"]["material_type"]
          notes: string | null
          po_number: string | null
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
          storage_location: string | null
          supplier: string | null
          temperature_on_receipt: number | null
          unit: string | null
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
          expiry_date?: string | null
          freight_tracking_number?: string | null
          id?: string
          internal_lot?: string | null
          manufacturer?: string | null
          manufacturer_lot?: string | null
          material_name: string
          material_type: Database["public"]["Enums"]["material_type"]
          notes?: string | null
          po_number?: string | null
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
          storage_location?: string | null
          supplier?: string | null
          temperature_on_receipt?: number | null
          unit?: string | null
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
          expiry_date?: string | null
          freight_tracking_number?: string | null
          id?: string
          internal_lot?: string | null
          manufacturer?: string | null
          manufacturer_lot?: string | null
          material_name?: string
          material_type?: Database["public"]["Enums"]["material_type"]
          notes?: string | null
          po_number?: string | null
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
          storage_location?: string | null
          supplier?: string | null
          temperature_on_receipt?: number | null
          unit?: string | null
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
      samples: {
        Row: {
          batch_id: string
          client: string
          coc_id: string | null
          coc_line_no: number | null
          compound: string | null
          created_at: string
          created_by: string | null
          id: string
          lot: string | null
          notes: string | null
          parameters: string[]
          project: string | null
          raw_data_file_path: string | null
          receipt_date: string
          status: Database["public"]["Enums"]["sample_status"]
          updated_at: string
        }
        Insert: {
          batch_id: string
          client: string
          coc_id?: string | null
          coc_line_no?: number | null
          compound?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lot?: string | null
          notes?: string | null
          parameters?: string[]
          project?: string | null
          raw_data_file_path?: string | null
          receipt_date?: string
          status?: Database["public"]["Enums"]["sample_status"]
          updated_at?: string
        }
        Update: {
          batch_id?: string
          client?: string
          coc_id?: string | null
          coc_line_no?: number | null
          compound?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lot?: string | null
          notes?: string | null
          parameters?: string[]
          project?: string | null
          raw_data_file_path?: string | null
          receipt_date?: string
          status?: Database["public"]["Enums"]["sample_status"]
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
          container_label: string | null
          created_at: string
          created_by: string | null
          expiration_date: string | null
          final_volume: string | null
          id: string
          log_number: string
          manufacturer_lot: string | null
          material_receipt_id: string | null
          mixing_details: string | null
          notes: string | null
          preparation_steps: Json
          prepared_at: string
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
        }
        Insert: {
          analyst_id?: string | null
          analyst_name: string
          appearance_notes?: string | null
          approved_at?: string | null
          approver_id?: string | null
          approver_name?: string | null
          container_label?: string | null
          created_at?: string
          created_by?: string | null
          expiration_date?: string | null
          final_volume?: string | null
          id?: string
          log_number?: string
          manufacturer_lot?: string | null
          material_receipt_id?: string | null
          mixing_details?: string | null
          notes?: string | null
          preparation_steps?: Json
          prepared_at?: string
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
        }
        Update: {
          analyst_id?: string | null
          analyst_name?: string
          appearance_notes?: string | null
          approved_at?: string | null
          approver_id?: string | null
          approver_name?: string | null
          container_label?: string | null
          created_at?: string
          created_by?: string | null
          expiration_date?: string | null
          final_volume?: string | null
          id?: string
          log_number?: string
          manufacturer_lot?: string | null
          material_receipt_id?: string | null
          mixing_details?: string | null
          notes?: string | null
          preparation_steps?: Json
          prepared_at?: string
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
      next_material_receipt_number: { Args: never; Returns: string }
      next_standard_preparation_number: { Args: never; Returns: string }
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
