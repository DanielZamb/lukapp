Pod::Spec.new do |s|
  s.name = 'LukappCustody'
  s.version = '0.1.0'
  s.summary = 'Installation signing and encrypted device input'
  s.description = s.summary
  s.license = 'Private'
  s.author = 'Lukapp'
  s.homepage = 'https://sennkai.com'
  s.platform = :ios, '16.4'
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoSQLite', '57.0.4'
  s.pod_target_xcconfig = { 'OTHER_SWIFT_FLAGS' => '$(inherited) -Xcc -DSQLITE_HAS_CODEC=1' }
  s.source_files = '**/*.swift'
  s.swift_version = '5.9'
end
