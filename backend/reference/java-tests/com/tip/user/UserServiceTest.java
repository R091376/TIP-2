package com.tip.user;

import com.tip.config.UserProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private AppUserRepository users;
    @Mock
    private CashLedgerRepository ledger;

    private PasswordEncoder encoder;
    private UserService service;

    @BeforeEach
    void setUp() {
        encoder = new BCryptPasswordEncoder();
        UserProperties props = new UserProperties();
        props.setDefaultSeedCash(new BigDecimal("100000"));
        props.setAdminUsername("admin");
        props.setAdminPassword("admin");
        service = new UserService(users, ledger, encoder, props);
    }

    @Test
    void createUserSeedsCashAndLedger() {
        when(users.existsByUsernameIgnoreCase("alice")).thenReturn(false);
        when(users.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledger.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AppUserEntity created = service.createUser("alice", "secret", UserRole.USER, "Alice", null);

        assertThat(created.getUsername()).isEqualTo("alice");
        assertThat(created.getCashBalance()).isEqualByComparingTo("100000.00");
        assertThat(encoder.matches("secret", created.getPasswordHash())).isTrue();
        verify(ledger).save(any(CashLedgerEntity.class));
    }

    @Test
    void createUserRejectsDuplicate() {
        when(users.existsByUsernameIgnoreCase("alice")).thenReturn(true);
        assertThatThrownBy(() -> service.createUser("alice", "secret", UserRole.USER, null, null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void resetAccountSetsCash() {
        UUID id = UUID.randomUUID();
        AppUserEntity user = new AppUserEntity(
                id, "bob", encoder.encode("x"), UserRole.USER, null,
                new BigDecimal("50000.00"), true, true, Instant.now(), Instant.now()
        );
        when(users.findById(id)).thenReturn(Optional.of(user));
        when(users.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledger.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AppUserEntity out = service.resetAccount(id, null);
        assertThat(out.getCashBalance()).isEqualByComparingTo("100000.00");

        ArgumentCaptor<CashLedgerEntity> cap = ArgumentCaptor.forClass(CashLedgerEntity.class);
        verify(ledger).save(cap.capture());
        assertThat(cap.getValue().getEntryType()).isEqualTo(CashLedgerType.RESET);
    }
}
