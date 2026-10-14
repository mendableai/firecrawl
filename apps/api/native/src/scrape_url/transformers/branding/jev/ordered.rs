//! A JSON object that keeps its keys in order, as JS objects do; serde_json's
//! map sorts them. Jev reads the request in this order, and ties between
//! answer probabilities resolve by it.

use std::fmt;
use std::marker::PhantomData;

use serde::de::{MapAccess, Visitor};
use serde::{Deserialize, Deserializer, Serialize, Serializer};

pub struct Ordered<V>(pub Vec<(String, V)>);

impl<V> Ordered<V> {
  pub fn get(&self, key: &str) -> Option<&V> {
    self.0.iter().find(|(k, _)| k == key).map(|(_, v)| v)
  }
}

impl<V: Serialize> Serialize for Ordered<V> {
  fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
    serializer.collect_map(self.0.iter().map(|(k, v)| (k, v)))
  }
}

impl<'de, V: Deserialize<'de>> Deserialize<'de> for Ordered<V> {
  fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
    struct OrderedVisitor<V>(PhantomData<V>);

    impl<'de, V: Deserialize<'de>> Visitor<'de> for OrderedVisitor<V> {
      type Value = Ordered<V>;

      fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("an object")
      }

      fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
        let mut entries = Vec::new();
        while let Some(entry) = map.next_entry()? {
          entries.push(entry);
        }
        Ok(Ordered(entries))
      }
    }

    deserializer.deserialize_map(OrderedVisitor(PhantomData))
  }
}
