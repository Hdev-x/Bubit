package com.bubit.trade.paper;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PaperServiceTest {
    private final PaperMapper mapper = mock(PaperMapper.class);
    private final PaperService service = new PaperService(mapper);

    @BeforeEach
    void account() {
        PaperAccountDTO account = new PaperAccountDTO();
        account.setBalance(1000);
        account.setPeakEquity(10000);
        when(mapper.selectAccount("owner")).thenReturn(account);
    }

    @Test
    void invalidAmountsAndLeverageNeverReachDatabase() {
        clearInvocations(mapper);
        for (double invalid : new double[]{Double.NaN, Double.POSITIVE_INFINITY, -1, 0}) {
            assertThrows(IllegalArgumentException.class, () -> service.openMarket("owner", "BTCUSDT", "long", invalid, 10, 100));
            assertThrows(IllegalArgumentException.class, () -> service.placeLimit("owner", "BTCUSDT", "long", 10, 10, invalid));
        }
        assertThrows(IllegalArgumentException.class, () -> service.openMarket("owner", "BTCUSDT", "long", 100, 101, 100));
        verifyNoInteractions(mapper);
    }

    @Test
    void insufficientBalanceDoesNotCreatePosition() {
        assertThrows(IllegalStateException.class, () -> service.openMarket("owner", "BTCUSDT", "long", 1001, 10, 100));
        verify(mapper, never()).insertPosition(any());
        verify(mapper, never()).addBalance(anyString(), anyDouble());
    }

    @Test
    void accountIsLockedBeforePositionMutationAndShortProfitIsReturned() {
        PaperPositionDTO position = new PaperPositionDTO();
        position.setDirection("short");
        position.setEntryPrice(100);
        position.setSize(2);
        position.setMargin(20);
        when(mapper.selectPosition(7, "owner")).thenReturn(position);

        assertEquals(20, service.closeMarket("owner", 7, 90));
        InOrder sequence = inOrder(mapper);
        sequence.verify(mapper).selectAccount("owner");
        sequence.verify(mapper).selectPosition(7, "owner");
        sequence.verify(mapper).addBalance("owner", 40);
        sequence.verify(mapper).deletePosition(7, "owner");
    }

    @Test
    void missingOrForeignPositionCannotChangeBalance() {
        assertThrows(IllegalStateException.class, () -> service.closeMarket("owner", 99, 100));
        verify(mapper).selectPosition(99, "owner");
        verify(mapper, never()).addBalance(anyString(), anyDouble());
    }

    @Test
    void canceledOrderCannotBeFilledAndResetClearsOnlyOwnersData() {
        PaperOrderDTO order = new PaperOrderDTO();
        order.setId(5);
        order.setMemberId("owner");
        when(mapper.markFilled(5)).thenReturn(0);
        service.fillOrder(order);
        verify(mapper, never()).insertPosition(any());

        service.reset("owner");
        verify(mapper).deleteAllPositions("owner");
        verify(mapper).deleteAllOrders("owner");
        verify(mapper).setBalance("owner", 10000);
    }
}
