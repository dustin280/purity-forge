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
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
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
          created_at: string
          created_by: string | null
          id: string
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
          created_at?: string
          created_by?: string | null
          id?: string
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
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          parameters?: string[]
          project?: string | null
          raw_data_file_path?: string | null
          receipt_date?: string
          status?: Database["public"]["Enums"]["sample_status"]
          updated_at?: string
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
    }
    Enums: {
      app_role: "admin" | "tech" | "reviewer"
      sample_status: "received" | "in_progress" | "reviewed" | "approved"
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
      sample_status: ["received", "in_progress", "reviewed", "approved"],
      test_status: ["pending", "running", "completed", "failed"],
    },
  },
} as const
