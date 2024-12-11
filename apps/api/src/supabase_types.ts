export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string | null;
          id: number;
          key: string | null;
          keyType: string;
          name: string | null;
          project_id: number | null;
        };
        Insert: {
          created_at?: string | null;
          id?: number;
          key?: string | null;
          keyType?: string;
          name?: string | null;
          project_id?: number | null;
        };
        Update: {
          created_at?: string | null;
          id?: number;
          key?: string | null;
          keyType?: string;
          name?: string | null;
          project_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "api_keys_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "mendable_project";
            referencedColumns: ["id"];
          },
        ];
      };
      company: {
        Row: {
          company_id: number;
          company_name: string | null;
          display_name: string | null;
          is_white_label: boolean | null;
          name: string;
          playground_type: string | null;
          pricing_plan_id: number;
        };
        Insert: {
          company_id?: number;
          company_name?: string | null;
          display_name?: string | null;
          is_white_label?: boolean | null;
          name: string;
          playground_type?: string | null;
          pricing_plan_id?: number;
        };
        Update: {
          company_id?: number;
          company_name?: string | null;
          display_name?: string | null;
          is_white_label?: boolean | null;
          name?: string;
          playground_type?: string | null;
          pricing_plan_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "company_pricing_plan_id_fkey";
            columns: ["pricing_plan_id"];
            referencedRelation: "pricing_plan";
            referencedColumns: ["id"];
          },
        ];
      };
      constants: {
        Row: {
          created_at: string | null;
          default_prompt: string;
          id: number;
        };
        Insert: {
          created_at?: string | null;
          default_prompt: string;
          id?: number;
        };
        Update: {
          created_at?: string | null;
          default_prompt?: string;
          id?: number;
        };
        Relationships: [];
      };
      conversation: {
        Row: {
          conversation_id: number;
          end_time: string | null;
          experiment_id: string | null;
          project_id: number;
          start_time: string;
        };
        Insert: {
          conversation_id?: number;
          end_time?: string | null;
          experiment_id?: string | null;
          project_id: number;
          start_time: string;
        };
        Update: {
          conversation_id?: number;
          end_time?: string | null;
          experiment_id?: string | null;
          project_id?: number;
          start_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "mendable_project";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          id: string;
          stripe_customer_id: string | null;
          user_id: string | null;
        };
        Insert: {
          id: string;
          stripe_customer_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          id?: string;
          stripe_customer_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customers_id_fkey";
            columns: ["id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      data: {
        Row: {
          company_id: number | null;
          content: string | null;
          data_id: string | null;
          date_added: string | null;
          date_modified: string | null;
          embedding: string | null;
          id: number;
          manual_add: boolean | null;
          message_id: number | null;
          project_id: number | null;
          search_index: unknown | null;
          source: string | null;
          source_name: string | null;
          source_rank: number | null;
          source_text: string | null;
        };
        Insert: {
          company_id?: number | null;
          content?: string | null;
          data_id?: string | null;
          date_added?: string | null;
          date_modified?: string | null;
          embedding?: string | null;
          id?: number;
          manual_add?: boolean | null;
          message_id?: number | null;
          project_id?: number | null;
          search_index?: unknown | null;
          source?: string | null;
          source_name?: string | null;
          source_rank?: number | null;
          source_text?: string | null;
        };
        Update: {
          company_id?: number | null;
          content?: string | null;
          data_id?: string | null;
          date_added?: string | null;
          date_modified?: string | null;
          embedding?: string | null;
          id?: number;
          manual_add?: boolean | null;
          message_id?: number | null;
          project_id?: number | null;
          search_index?: unknown | null;
          source?: string | null;
          source_name?: string | null;
          source_rank?: number | null;
          source_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "data_company_id_fkey";
            columns: ["company_id"];
            referencedRelation: "company";
            referencedColumns: ["company_id"];
          },
          {
            foreignKeyName: "data_data_id_fkey";
            columns: ["data_id"];
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "data_message_id_fkey";
            columns: ["message_id"];
            referencedRelation: "message";
            referencedColumns: ["message_id"];
          },
          {
            foreignKeyName: "data_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "mendable_project";
            referencedColumns: ["id"];
          },
        ];
      };
      data_partitioned: {
        Row: {
          company_id: number | null;
          company_name: string;
          content: string | null;
          data_id: string | null;
          date_added: string | null;
          date_modified: string | null;
          embedding: string | null;
          id: number;
          manual_add: boolean | null;
          message_id: number | null;
          project_id: number | null;
          search_index: unknown | null;
          source: string | null;
          source_name: string | null;
          source_rank: number | null;
          source_text: string | null;
        };
        Insert: {
          company_id?: number | null;
          company_name: string;
          content?: string | null;
          data_id?: string | null;
          date_added?: string | null;
          date_modified?: string | null;
          embedding?: string | null;
          id: number;
          manual_add?: boolean | null;
          message_id?: number | null;
          project_id?: number | null;
          search_index?: unknown | null;
          source?: string | null;
          source_name?: string | null;
          source_rank?: number | null;
          source_text?: string | null;
        };
        Update: {
          company_id?: number | null;
          company_name?: string;
          content?: string | null;
          data_id?: string | null;
          date_added?: string | null;
          date_modified?: string | null;
          embedding?: string | null;
          id?: number;
          manual_add?: boolean | null;
          message_id?: number | null;
          project_id?: number | null;
          search_index?: unknown | null;
          source?: string | null;
          source_name?: string | null;
          source_rank?: number | null;
          source_text?: string | null;
        };
        Relationships: [];
      };
      data_sources: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          name: string | null;
          placeholder: string | null;
          type: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string | null;
          placeholder?: string | null;
          type?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string | null;
          placeholder?: string | null;
          type?: string | null;
        };
        Relationships: [];
      };
      marketing: {
        Row: {
          created_at: string | null;
          id: number;
          message: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: number;
          message?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: number;
          message?: string | null;
        };
        Relationships: [];
      };
      mendable_project: {
        Row: {
          company_id: number | null;
          created_at: string | null;
          display_id: string;
          enforce_whitelist: boolean | null;
          id: number;
          isFaqPublic: boolean;
          max_messages_per_month: number | null;
          max_req_per_ip_per_minute: number | null;
          name: string | null;
          prompt_id: number | null;
          support_url: string | null;
          whitelisted_domains: string[] | null;
        };
        Insert: {
          company_id?: number | null;
          created_at?: string | null;
          display_id?: string;
          enforce_whitelist?: boolean | null;
          id?: number;
          isFaqPublic?: boolean;
          max_messages_per_month?: number | null;
          max_req_per_ip_per_minute?: number | null;
          name?: string | null;
          prompt_id?: number | null;
          support_url?: string | null;
          whitelisted_domains?: string[] | null;
        };
        Update: {
          company_id?: number | null;
          created_at?: string | null;
          display_id?: string;
          enforce_whitelist?: boolean | null;
          id?: number;
          isFaqPublic?: boolean;
          max_messages_per_month?: number | null;
          max_req_per_ip_per_minute?: number | null;
          name?: string | null;
          prompt_id?: number | null;
          support_url?: string | null;
          whitelisted_domains?: string[] | null;
        };
        Relationships: [
          {
            foreignKeyName: "mendable_project_company_id_fkey";
            columns: ["company_id"];
            referencedRelation: "company";
            referencedColumns: ["company_id"];
          },
        ];
      };
      message: {
        Row: {
          conversation_id: number;
          embedding: string | null;
          is_taught: boolean | null;
          message: string;
          message_id: number;
          model_configuration: Json | null;
          prompt_text: string | null;
          rating_value: number | null;
          rephrased_text: string | null;
          sender: string;
          timestamp: string;
        };
        Insert: {
          conversation_id: number;
          embedding?: string | null;
          is_taught?: boolean | null;
          message: string;
          message_id?: number;
          model_configuration?: Json | null;
          prompt_text?: string | null;
          rating_value?: number | null;
          rephrased_text?: string | null;
          sender: string;
          timestamp: string;
        };
        Update: {
          conversation_id?: number;
          embedding?: string | null;
          is_taught?: boolean | null;
          message?: string;
          message_id?: number;
          model_configuration?: Json | null;
          prompt_text?: string | null;
          rating_value?: number | null;
          rephrased_text?: string | null;
          sender?: string;
          timestamp?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_conversation_id_fkey";
            columns: ["conversation_id"];
            referencedRelation: "conversation";
            referencedColumns: ["conversation_id"];
          },
        ];
      };
      model_configuration: {
        Row: {
          created_at: string | null;
          custom_prompt: string | null;
          id: number;
          model_name: string | null;
          project_id: number;
          suggested_questions: string | null;
          support_link: string | null;
          temperature: number;
        };
        Insert: {
          created_at?: string | null;
          custom_prompt?: string | null;
          id?: number;
          model_name?: string | null;
          project_id: number;
          suggested_questions?: string | null;
          support_link?: string | null;
          temperature?: number;
        };
        Update: {
          created_at?: string | null;
          custom_prompt?: string | null;
          id?: number;
          model_name?: string | null;
          project_id?: number;
          suggested_questions?: string | null;
          support_link?: string | null;
          temperature?: number;
        };
        Relationships: [
          {
            foreignKeyName: "model_configuration_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "mendable_project";
            referencedColumns: ["id"];
          },
        ];
      };
      monthly_message_counts: {
        Row: {
          message_count: number | null;
          month: number;
          project_id: number;
          year: number;
        };
        Insert: {
          message_count?: number | null;
          month: number;
          project_id: number;
          year: number;
        };
        Update: {
          message_count?: number | null;
          month?: number;
          project_id?: number;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "monthly_message_counts_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "mendable_project";
            referencedColumns: ["id"];
          },
        ];
      };
      prices: {
        Row: {
          active: boolean | null;
          currency: string | null;
          description: string | null;
          id: string;
          interval: Database["public"]["Enums"]["pricing_plan_interval"] | null;
          interval_count: number | null;
          metadata: Json | null;
          product_id: string | null;
          trial_period_days: number | null;
          type: Database["public"]["Enums"]["pricing_type"] | null;
          unit_amount: number | null;
        };
        Insert: {
          active?: boolean | null;
          currency?: string | null;
          description?: string | null;
          id: string;
          interval?:
            | Database["public"]["Enums"]["pricing_plan_interval"]
            | null;
          interval_count?: number | null;
          metadata?: Json | null;
          product_id?: string | null;
          trial_period_days?: number | null;
          type?: Database["public"]["Enums"]["pricing_type"] | null;
          unit_amount?: number | null;
        };
        Update: {
          active?: boolean | null;
          currency?: string | null;
          description?: string | null;
          id?: string;
          interval?:
            | Database["public"]["Enums"]["pricing_plan_interval"]
            | null;
          interval_count?: number | null;
          metadata?: Json | null;
          product_id?: string | null;
          trial_period_days?: number | null;
          type?: Database["public"]["Enums"]["pricing_type"] | null;
          unit_amount?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "prices_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      pricing_plan: {
        Row: {
          base_price: number;
          created_at: string | null;
          gpt_35_turbo_price: number | null;
          gpt_4_price: number | null;
          id: number;
          max_messages_per_month: number | null;
          name: string | null;
          price_per_message: number | null;
          stripe_subscription: boolean;
        };
        Insert: {
          base_price?: number;
          created_at?: string | null;
          gpt_35_turbo_price?: number | null;
          gpt_4_price?: number | null;
          id?: number;
          max_messages_per_month?: number | null;
          name?: string | null;
          price_per_message?: number | null;
          stripe_subscription?: boolean;
        };
        Update: {
          base_price?: number;
          created_at?: string | null;
          gpt_35_turbo_price?: number | null;
          gpt_4_price?: number | null;
          id?: number;
          max_messages_per_month?: number | null;
          name?: string | null;
          price_per_message?: number | null;
          stripe_subscription?: boolean;
        };
        Relationships: [];
      };
      products: {
        Row: {
          active: boolean | null;
          description: string | null;
          id: string;
          image: string | null;
          metadata: Json | null;
          name: string | null;
        };
        Insert: {
          active?: boolean | null;
          description?: string | null;
          id: string;
          image?: string | null;
          metadata?: Json | null;
          name?: string | null;
        };
        Update: {
          active?: boolean | null;
          description?: string | null;
          id?: string;
          image?: string | null;
          metadata?: Json | null;
          name?: string | null;
        };
        Relationships: [];
      };
      prompt: {
        Row: {
          name: string | null;
          prompt: string | null;
          prompt_id: number;
        };
        Insert: {
          name?: string | null;
          prompt?: string | null;
          prompt_id?: number;
        };
        Update: {
          name?: string | null;
          prompt?: string | null;
          prompt_id?: number;
        };
        Relationships: [];
      };
      source: {
        Row: {
          content: string | null;
          created_at: string | null;
          id: number;
          link: string | null;
          message_id: number;
        };
        Insert: {
          content?: string | null;
          created_at?: string | null;
          id?: number;
          link?: string | null;
          message_id: number;
        };
        Update: {
          content?: string | null;
          created_at?: string | null;
          id?: number;
          link?: string | null;
          message_id?: number;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          cancel_at: string | null;
          cancel_at_period_end: boolean | null;
          canceled_at: string | null;
          company_id: number | null;
          created: string;
          current_period_end: string;
          current_period_start: string;
          ended_at: string | null;
          id: string;
          metadata: Json | null;
          price_id: string | null;
          quantity: number | null;
          status: Database["public"]["Enums"]["subscription_status"] | null;
          sub_item_id: string | null;
          trial_end: string | null;
          trial_start: string | null;
          usage_pricing_id: string | null;
          user_id: string;
        };
        Insert: {
          cancel_at?: string | null;
          cancel_at_period_end?: boolean | null;
          canceled_at?: string | null;
          company_id?: number | null;
          created?: string;
          current_period_end?: string;
          current_period_start?: string;
          ended_at?: string | null;
          id: string;
          metadata?: Json | null;
          price_id?: string | null;
          quantity?: number | null;
          status?: Database["public"]["Enums"]["subscription_status"] | null;
          sub_item_id?: string | null;
          trial_end?: string | null;
          trial_start?: string | null;
          usage_pricing_id?: string | null;
          user_id: string;
        };
        Update: {
          cancel_at?: string | null;
          cancel_at_period_end?: boolean | null;
          canceled_at?: string | null;
          company_id?: number | null;
          created?: string;
          current_period_end?: string;
          current_period_start?: string;
          ended_at?: string | null;
          id?: string;
          metadata?: Json | null;
          price_id?: string | null;
          quantity?: number | null;
          status?: Database["public"]["Enums"]["subscription_status"] | null;
          sub_item_id?: string | null;
          trial_end?: string | null;
          trial_start?: string | null;
          usage_pricing_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey";
            columns: ["company_id"];
            referencedRelation: "company";
            referencedColumns: ["company_id"];
          },
          {
            foreignKeyName: "subscriptions_price_id_fkey";
            columns: ["price_id"];
            referencedRelation: "prices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      suggested_questions: {
        Row: {
          created_at: string | null;
          id: number;
          project_id: number | null;
          question: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: number;
          project_id?: number | null;
          question?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: number;
          project_id?: number | null;
          question?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "suggested_questions_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "mendable_project";
            referencedColumns: ["id"];
          },
        ];
      };
      user_notifications: {
        Row: {
          company_id: number;
          id: number;
          notification_type: string;
          project_id: number;
          sent_date: string;
          user_id: string;
        };
        Insert: {
          company_id: number;
          id?: number;
          notification_type: string;
          project_id: number;
          sent_date: string;
          user_id: string;
        };
        Update: {
          company_id?: number;
          id?: number;
          notification_type?: string;
          project_id?: number;
          sent_date?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_notifications_company_id_fkey";
            columns: ["company_id"];
            referencedRelation: "company";
            referencedColumns: ["company_id"];
          },
          {
            foreignKeyName: "user_notifications_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "mendable_project";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_notifications_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          avatar_url: string | null;
          billing_address: Json | null;
          company_id: number | null;
          email: string | null;
          full_name: string | null;
          id: string;
          payment_method: Json | null;
        };
        Insert: {
          avatar_url?: string | null;
          billing_address?: Json | null;
          company_id?: number | null;
          email?: string | null;
          full_name?: string | null;
          id: string;
          payment_method?: Json | null;
        };
        Update: {
          avatar_url?: string | null;
          billing_address?: Json | null;
          company_id?: number | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          payment_method?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "users_company_id_fkey";
            columns: ["company_id"];
            referencedRelation: "company";
            referencedColumns: ["company_id"];
          },
          {
            foreignKeyName: "users_id_fkey";
            columns: ["id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      z_testcomp_92511: {
        Row: {
          content: string | null;
          data_id: string | null;
          date_added: string | null;
          date_modified: string | null;
          embedding: string | null;
          id: number;
          manual_add: boolean | null;
          message_id: number | null;
          project_id: number | null;
          search_index: unknown | null;
          source: string | null;
          source_name: string | null;
          source_rank: number | null;
          source_text: string | null;
        };
        Insert: {
          content?: string | null;
          data_id?: string | null;
          date_added?: string | null;
          date_modified?: string | null;
          embedding?: string | null;
          id?: number;
          manual_add?: boolean | null;
          message_id?: number | null;
          project_id?: number | null;
          search_index?: unknown | null;
          source?: string | null;
          source_name?: string | null;
          source_rank?: number | null;
          source_text?: string | null;
        };
        Update: {
          content?: string | null;
          data_id?: string | null;
          date_added?: string | null;
          date_modified?: string | null;
          embedding?: string | null;
          id?: number;
          manual_add?: boolean | null;
          message_id?: number | null;
          project_id?: number | null;
          search_index?: unknown | null;
          source?: string | null;
          source_name?: string | null;
          source_rank?: number | null;
          source_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "z_testcomp_92511_data_id_fkey";
            columns: ["data_id"];
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "z_testcomp_92511_message_id_fkey";
            columns: ["message_id"];
            referencedRelation: "message";
            referencedColumns: ["message_id"];
          },
          {
            foreignKeyName: "z_testcomp_92511_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "mendable_project";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      combine_search_29: {
        Args: {
          query_embedding: string;
          query_text: string;
          table_name: string;
          project_id: number;
          similarity_threshold: number;
          search_thres: number;
          k?: number;
        };
        Returns: {
          id: number;
          content: string;
          source: string;
          similarity: number;
          rank: number;
          similarity_rank: number;
          rank_rank: number;
          rrf_score: number;
        }[];
      };
      create_company_table_2: {
        Args: {
          company: string;
        };
        Returns: undefined;
      };
      create_indexs: {
        Args: {
          tbl_name: string;
        };
        Returns: undefined;
      };
      create_mendable_project_3: {
        Args: {
          _company_name: string;
          _pricing_plan_id: number;
          _project_name: string;
        };
        Returns: Json;
      };
      create_new_company_table_5: {
        Args: {
          _company_name: string;
          _company_display_name: string;
        };
        Returns: number;
      };
      create_new_project_2: {
        Args: {
          _company_id: number;
          _project_name: string;
        };
        Returns: Json;
      };
      create_project_with_api_key_10: {
        Args: {
          _company_name: string;
          _pricing_plan_id: number;
          _project_name: string;
        };
        Returns: Json;
      };
      create_project_with_api_key_8: {
        Args: {
          _company_name: string;
          _pricing_plan_id: number;
          _project_name: string;
        };
        Returns: boolean;
      };
      create_table: {
        Args: {
          table_name: string;
        };
        Returns: undefined;
      };
      dmetaphone: {
        Args: {
          "": string;
        };
        Returns: string;
      };
      dmetaphone_alt: {
        Args: {
          "": string;
        };
        Returns: string;
      };
      get_all_conversation_with_messages_by_project_id: {
        Args: {
          _project_id: number;
          page: number;
          conversations_per_page: number;
        };
        Returns: {
          conversation_id: number;
          end_time: string | null;
          experiment_id: string | null;
          project_id: number;
          start_time: string;
        }[];
      };
      get_index_types: {
        Args: {
          _company_name: string;
          _project_id: number;
        };
        Returns: unknown;
      };
      get_message_count_by_project: {
        Args: {
          p_project_id: number;
        };
        Returns: {
          message_day: string;
          message_count: number;
        }[];
      };
      get_messages_by_project_and_rating: {
        Args: {
          _project_id: number;
          _rating_value: number;
          current_page: number;
          pages_per_set: number;
        };
        Returns: {
          message_id: number;
          conversation_id: number;
          message: string;
          timestamp: string;
          sender: string;
          rating_value: number;
          prev_message_id: number;
          prev_message: string;
          prev_timestamp: string;
          prev_sender: string;
        }[];
      };
      get_messages_without_sources_by_project_with_prev: {
        Args: {
          _project_id: number;
          current_page: number;
          pages_per_set: number;
        };
        Returns: {
          message_id: number;
          conversation_id: number;
          message: string;
          timestamp: string;
          sender: string;
          rating_value: number;
          prev_message_id: number;
          prev_message: string;
          prev_timestamp: string;
          prev_sender: string;
        }[];
      };
      get_messages_without_sources_count_by_project: {
        Args: {
          _project_id: number;
        };
        Returns: number;
      };
      get_negative_messages_count_by_project_id: {
        Args: {
          _project_id: number;
        };
        Returns: number;
      };
      get_positive_messages_count_by_project: {
        Args: {
          _project_id: number;
        };
        Returns: number;
      };
      get_project_and_company_with_model_configuration: {
        Args: {
          p_project_id: number;
        };
        Returns: {
          project: unknown;
          company: unknown;
          model_configuration: unknown;
        }[];
      };
      get_project_company_model: {
        Args: {
          api_key_in: string;
        };
        Returns: {
          company: unknown;
          project: unknown;
          configuration: unknown;
        }[];
      };
      get_project_message_count: {
        Args: {
          p_project_id: number;
          p_start_date: string;
          p_end_date: string;
        };
        Returns: number;
      };
      get_sources_count: {
        Args: {
          company_name: string;
          project_id: number;
        };
        Returns: number;
      };
      get_sources_from_message: {
        Args: {
          mid: number;
        };
        Returns: {
          content: string | null;
          created_at: string | null;
          id: number;
          link: string | null;
          message_id: number;
        }[];
      };
      get_sources_info_new: {
        Args: {
          company_name: string;
          project_id: number;
          pages_per_set: number;
          current_page: number;
        };
        Returns: {
          source: string;
          source_rank: number;
          data_id: string;
          source_text: string;
          source_name: string;
        }[];
      };
      get_subscription: {
        Args: {
          p_project_id: number;
        };
        Returns: {
          cancel_at: string | null;
          cancel_at_period_end: boolean | null;
          canceled_at: string | null;
          company_id: number | null;
          created: string;
          current_period_end: string;
          current_period_start: string;
          ended_at: string | null;
          id: string;
          metadata: Json | null;
          price_id: string | null;
          quantity: number | null;
          status: Database["public"]["Enums"]["subscription_status"] | null;
          sub_item_id: string | null;
          trial_end: string | null;
          trial_start: string | null;
          usage_pricing_id: string | null;
          user_id: string;
        };
      };
      get_total_conversations_count_by_project: {
        Args: {
          _project_id: number;
        };
        Returns: number;
      };
      get_trained_messages_from_project: {
        Args: {
          p_project_id: number;
          current_page: number;
          pages_per_set: number;
        };
        Returns: {
          current_message: Json;
          preceding_message: Json;
        }[];
      };
      get_trained_messages_from_project_count: {
        Args: {
          p_project_id: number;
        };
        Returns: number;
      };
      getPricingPlanByName: {
        Args: {
          company_name: string;
        };
        Returns: {
          base_price: number;
          created_at: string | null;
          gpt_35_turbo_price: number | null;
          gpt_4_price: number | null;
          id: number;
          max_messages_per_month: number | null;
          name: string | null;
          price_per_message: number | null;
          stripe_subscription: boolean;
        };
      };
      gtrgm_compress: {
        Args: {
          "": unknown;
        };
        Returns: unknown;
      };
      gtrgm_decompress: {
        Args: {
          "": unknown;
        };
        Returns: unknown;
      };
      gtrgm_in: {
        Args: {
          "": unknown;
        };
        Returns: unknown;
      };
      gtrgm_options: {
        Args: {
          "": unknown;
        };
        Returns: undefined;
      };
      gtrgm_out: {
        Args: {
          "": unknown;
        };
        Returns: unknown;
      };
      increment_message_count: {
        Args: {
          projectid: number;
          month: number;
          year: number;
        };
        Returns: undefined;
      };
      increment_message_count_2: {
        Args: {
          p_projectid: number;
          p_month: number;
          p_year: number;
        };
        Returns: undefined;
      };
      ivfflathandler: {
        Args: {
          "": unknown;
        };
        Returns: unknown;
      };
      keyword_search_trigram22: {
        Args: {
          k: number;
          query_text: string;
          table_name: string;
          project_id: number;
          limit_results: number;
        };
        Returns: {
          id: number;
          content: string;
          source: string;
          similarity_score: number;
        }[];
      };
      match_documents: {
        Args: {
          table_name: string;
          query_embedding: string;
          similarity_threshold: number;
          match_count: number;
        };
        Returns: {
          id: number;
          content: string;
          similarity: number;
          source: string;
        }[];
      };
      messagesSentThisMonthByName: {
        Args: {
          company_name: string;
        };
        Returns: number;
      };
      search_content_priority_by_project_2: {
        Args: {
          tbl_name: string;
          query_text: string;
          search_thres: number;
          num_results: number;
          project_id: number;
        };
        Returns: {
          id: number;
          content: string;
          source: string;
          rank: number;
        }[];
      };
      search_content_priority30: {
        Args: {
          query_text: string;
          tbl_name: string;
          num_results: number;
          search_thres: number;
        };
        Returns: {
          id: number;
          content: string;
          source: string;
          rank: number;
        }[];
      };
      search_documents: {
        Args: {
          k: number;
          query_embedding: string;
          query_text: string;
          table_name: string;
          project_id: number;
          limit_results: number;
        };
        Returns: {
          id: number;
          content: string;
          source: string;
          similarity: number;
          rank: number;
          similarity_rank: number;
          rank_rank: number;
          rrf_score: number;
        }[];
      };
      search_documents_return_all5: {
        Args: {
          k: number;
          query_embedding: string;
          query_text: string;
          table_name: string;
          project_id: number;
          limit_results: number;
        };
        Returns: {
          id: number;
          content: string;
          source: string;
          similarity: number;
          rank: number;
          similarity_rank: number;
          rank_rank: number;
          rrf_score: number;
          source_name: string;
          date_added: string;
          date_modified: string;
        }[];
      };
      set_limit: {
        Args: {
          "": number;
        };
        Returns: number;
      };
      show_limit: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      show_trgm: {
        Args: {
          "": string;
        };
        Returns: unknown;
      };
      soundex: {
        Args: {
          "": string;
        };
        Returns: string;
      };
      text_soundex: {
        Args: {
          "": string;
        };
        Returns: string;
      };
      update_search_index: {
        Args: {
          table_name: string;
        };
        Returns: undefined;
      };
      update_search_index_2: {
        Args: {
          table_name: string;
        };
        Returns: Json;
      };
      update_search_index_single_row: {
        Args: {
          table_name: string;
          row_id: number;
        };
        Returns: Json;
      };
      vector_avg: {
        Args: {
          "": number[];
        };
        Returns: string;
      };
      vector_dims: {
        Args: {
          "": string;
        };
        Returns: number;
      };
      vector_norm: {
        Args: {
          "": string;
        };
        Returns: number;
      };
      vector_out: {
        Args: {
          "": string;
        };
        Returns: unknown;
      };
      vector_send: {
        Args: {
          "": string;
        };
        Returns: string;
      };
      vector_typmod_in: {
        Args: {
          "": unknown[];
        };
        Returns: number;
      };
      get_documents: {
        Args: {
          c_company_id;
          page_size;
          z_offset;
        };
      };
    };
    Enums: {
      pricing_plan_interval: "day" | "week" | "month" | "year";
      pricing_type: "one_time" | "recurring";
      subscription_status:
        | "trialing"
        | "active"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "past_due"
        | "unpaid"
        | "paused";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
